import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("e2e-sss2: full SSS-2 lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet.payer;
  const mint = Keypair.generate();
  const minter = Keypair.generate();
  const blacklister = Keypair.generate();
  const freezer = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();

  let configPda: PublicKey;
  let extraAccountMetasPda: PublicKey;
  let ataA: PublicKey;
  let ataB: PublicKey;
  let authorityAta: PublicKey;

  function rolePda(roleType: number, assignee: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        configPda.toBuffer(),
        Buffer.from([roleType]),
        assignee.toBuffer(),
      ],
      program.programId
    );
    return pda;
  }

  function blacklistPda(user: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), mint.publicKey.toBuffer(), user.toBuffer()],
      hookProgram.programId
    );
    return pda;
  }

  async function createAta(owner: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      ata,
      owner,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const sig = await provider.sendAndConfirm(new Transaction().add(ix));
    await provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  it("completes full SSS-2 lifecycle with hook, blacklist, and seize", async () => {
    // ----- Airdrop -----
    for (const s of [minter, blacklister, freezer, userA, userB]) {
      const sig = await provider.connection.requestAirdrop(
        s.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // ----- Derive PDAs -----
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
    [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()],
      hookProgram.programId
    );

    // ===== Step 1: Create SSS-2 Mint (hook + permanent delegate + default frozen) =====
    await program.methods
      .initialize({
        name: "E2E-SSS2",
        symbol: "SSS2",
        uri: "https://example.com/sss2.json",
        decimals: 6,
        enableTransferHook: true,
        enablePermanentDelegate: true,
        defaultAccountFrozen: true,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.equal(true);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.defaultAccountFrozen).to.equal(true);

    // ===== Step 2: Setup Hook ExtraAccountMetas =====
    await hookProgram.methods
      .initializeExtraAccountMetas()
      .accountsStrict({
        payer: authority.publicKey,
        extraAccountMetas: extraAccountMetasPda,
        mint: mint.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // ===== Step 3: Assign roles =====
    for (const [roleType, signer] of [
      [0, minter],
      [3, freezer],
      [4, blacklister],
    ] as [number, Keypair][]) {
      await program.methods
        .updateRoles(roleType, signer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: rolePda(roleType, signer.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Set minter quota
    await program.methods
      .updateMinter(new anchor.BN(100_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: rolePda(0, minter.publicKey),
      })
      .rpc();

    // ===== Step 4: Create ATAs (will be frozen by default) =====
    ataA = await createAta(userA.publicKey);
    ataB = await createAta(userB.publicKey);
    authorityAta = await createAta(authority.publicKey);

    // ===== Step 5: Mint tokens to userA (auto-thaws frozen account) =====
    const mintSig = await program.methods
      .mint(new anchor.BN(50_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole: rolePda(0, minter.publicKey),
        mint: mint.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(mintSig, "confirmed");

    let accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountA.amount)).to.equal(50_000_000);

    // ===== Step 6: Thaw accounts for transfer =====
    const freezerRole = rolePda(3, freezer.publicKey);

    // Thaw each account if frozen
    for (const ata of [ataA, ataB, authorityAta]) {
      const info = await getAccount(provider.connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (info.isFrozen) {
        const sig = await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        await provider.connection.confirmTransaction(sig, "confirmed");
      }
    }

    // ===== Step 7: Transfer succeeds (no blacklist) =====
    let ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      ataA,
      mint.publicKey,
      ataB,
      userA.publicKey,
      BigInt(5_000_000),
      6,
      undefined,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const txSig = await provider.sendAndConfirm(new Transaction().add(ix), [userA]);
    await provider.connection.confirmTransaction(txSig, "confirmed");

    let accountB = await getAccount(
      provider.connection,
      ataB,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountB.amount)).to.equal(5_000_000);

    // ===== Step 8: Blacklist userA =====
    const blacklisterRole = rolePda(4, blacklister.publicKey);
    const blEntryA = blacklistPda(userA.publicKey);

    const blSig = await program.methods
      .addToBlacklist(userA.publicKey, "OFAC match")
      .accountsStrict({
        blacklister: blacklister.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([blacklister])
      .rpc();
    await provider.connection.confirmTransaction(blSig, "confirmed");

    // ===== Step 9: Transfer fails (sender blacklisted) =====
    try {
      ix = await createTransferCheckedWithTransferHookInstruction(
        provider.connection,
        ataA,
        mint.publicKey,
        ataB,
        userA.publicKey,
        BigInt(100),
        6,
        undefined,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new Transaction().add(ix), [userA]);
      expect.fail("Should have thrown — sender is blacklisted");
    } catch (e: any) {
      const errStr = e.toString();
      expect(
        errStr.includes("failed") || errStr.includes("Blacklisted") || errStr.includes("Error")
      ).to.equal(true);
    }

    // ===== Step 10: Seize tokens from blacklisted userA =====
    accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const seizeAmount = Number(accountA.amount);
    expect(seizeAmount).to.be.greaterThan(0);

    // Assign Seizer role (type 5) to authority
    const seizerRole = rolePda(5, authority.publicKey);
    await program.methods
      .updateRoles(5, authority.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: seizerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Derive extra accounts needed by the transfer hook
    const senderBlPda = blacklistPda(userA.publicKey);
    const receiverBlPda = blacklistPda(authority.publicKey);

    const seizeSig = await program.methods
      .seize()
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        seizerRole,
        mint: mint.publicKey,
        from: ataA,
        to: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: hookProgram.programId, isSigner: false, isWritable: false },
        { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
        { pubkey: senderBlPda, isSigner: false, isWritable: false },
        { pubkey: receiverBlPda, isSigner: false, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
      ])
      .rpc();
    await provider.connection.confirmTransaction(seizeSig, "confirmed");

    accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountA.amount)).to.equal(0);

    const authorityAccount = await getAccount(
      provider.connection,
      authorityAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(authorityAccount.amount)).to.equal(seizeAmount);

    // ===== Step 11: Unblacklist userA =====
    const rmSig = await program.methods
      .removeFromBlacklist(userA.publicKey)
      .accountsStrict({
        blacklister: blacklister.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mint.publicKey,
      })
      .signers([blacklister])
      .rpc();
    await provider.connection.confirmTransaction(rmSig, "confirmed");

    // ===== Step 12: Transfer succeeds after unblacklist =====
    // Mint fresh tokens to userA for this test
    const mint2Sig = await program.methods
      .mint(new anchor.BN(2_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole: rolePda(0, minter.publicKey),
        mint: mint.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(mint2Sig, "confirmed");

    // ataA was auto-thawed by mint if it was frozen, but let's check
    accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    if (accountA.isFrozen) {
      const thawSig2 = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: ataA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(thawSig2, "confirmed");
    }

    ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      ataA,
      mint.publicKey,
      ataB,
      userA.publicKey,
      BigInt(1_000_000),
      6,
      undefined,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const txSig2 = await provider.sendAndConfirm(new Transaction().add(ix), [userA]);
    await provider.connection.confirmTransaction(txSig2, "confirmed");

    accountB = await getAccount(
      provider.connection,
      ataB,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountB.amount)).to.equal(6_000_000);

    // ===== Final verification =====
    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.equal(true);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.paused).to.equal(false);
  });
});
