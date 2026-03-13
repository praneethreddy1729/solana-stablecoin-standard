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

  const authority = provider.wallet.payer!;
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
  let treasuryAta: PublicKey;

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

  async function thawIfFrozen(ata: PublicKey): Promise<void> {
    const info = await getAccount(
      provider.connection,
      ata,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    if (info.isFrozen) {
      const freezerRole = rolePda(3, freezer.publicKey);
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

  before(async () => {
    // Fund all keypairs
    for (const s of [minter, blacklister, freezer, userA, userB]) {
      const sig = await provider.connection.requestAirdrop(
        s.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
    [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()],
      hookProgram.programId
    );

    // Derive treasury ATA
    treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
  });

  // ============================================================
  // Step 1: Initialize SSS-2 Token (with hook + permanent delegate)
  // ============================================================

  it("initialize SSS-2 token with hook and permanent delegate", async () => {
    await program.methods
      .initialize({
        name: "E2E-SSS2",
        symbol: "SSS2",
        uri: "https://example.com/sss2.json",
        decimals: 6,
        enableTransferHook: true,
        enablePermanentDelegate: true,
        defaultAccountFrozen: true,
        treasury: treasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        registryEntry: PublicKey.findProgramAddressSync(
          [Buffer.from("registry"), mint.publicKey.toBuffer()],
          program.programId
        )[0],
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.equal(true);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.defaultAccountFrozen).to.equal(true);
    expect(config.decimals).to.equal(6);
  });

  // ============================================================
  // Step 2: Initialize ExtraAccountMetas
  // ============================================================

  it("initialize extra account metas for transfer hook", async () => {
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

    const info = await provider.connection.getAccountInfo(
      extraAccountMetasPda
    );
    expect(info).to.not.be.null;
    expect(info!.owner.toString()).to.equal(hookProgram.programId.toString());
  });

  // ============================================================
  // Step 3: Assign Roles (Minter, Blacklister, Seizer, Freezer)
  // ============================================================

  it("assign minter, blacklister, seizer, and freezer roles", async () => {
    const roleAssignments: [number, Keypair][] = [
      [0, minter],       // Minter
      [3, freezer],      // Freezer
      [4, blacklister],  // Blacklister
      [4, authority],    // Authority also gets Blacklister for convenience
    ];

    for (const [roleType, signer] of roleAssignments) {
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

    // Assign Seizer role to authority
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

    // Verify minter role
    const minterData = await program.account.roleAssignment.fetch(
      rolePda(0, minter.publicKey)
    );
    expect(minterData.isActive).to.equal(true);
    expect(minterData.roleType).to.equal(0);
  });

  // ============================================================
  // Step 4: Mint Tokens to userA
  // ============================================================

  it("create ATAs and mint tokens to userA", async () => {
    ataA = await createAta(userA.publicKey);
    ataB = await createAta(userB.publicKey);
    authorityAta = await createAta(authority.publicKey);

    const minterRole = rolePda(0, minter.publicKey);
    const mintSig = await program.methods
      .mint(new anchor.BN(50_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mint.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(mintSig, "confirmed");

    const accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountA.amount)).to.equal(50_000_000);
  });

  // ============================================================
  // Step 5: Transfer Tokens Between Users (Hook Allows Clean Transfer)
  // ============================================================

  it("transfer tokens between non-blacklisted users via hook", async () => {
    // Thaw accounts if frozen (DefaultAccountState=Frozen)
    await thawIfFrozen(ataA);
    await thawIfFrozen(ataB);
    await thawIfFrozen(authorityAta);

    const ix = await createTransferCheckedWithTransferHookInstruction(
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
    const txSig = await provider.sendAndConfirm(
      new Transaction().add(ix),
      [userA]
    );
    await provider.connection.confirmTransaction(txSig, "confirmed");

    const accountB = await getAccount(
      provider.connection,
      ataB,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountB.amount)).to.equal(5_000_000);
  });

  // ============================================================
  // Step 6: Blacklist userA
  // ============================================================

  it("blacklist userA with reason", async () => {
    const blacklisterRole = rolePda(4, authority.publicKey);
    const blEntryA = blacklistPda(userA.publicKey);

    const blSig = await program.methods
      .addToBlacklist(userA.publicKey, "OFAC match")
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();
    await provider.connection.confirmTransaction(blSig, "confirmed");

    // Verify blacklist entry exists on-chain
    const blInfo = await provider.connection.getAccountInfo(blEntryA);
    expect(blInfo).to.not.be.null;
    expect(blInfo!.owner.toString()).to.equal(hookProgram.programId.toString());
  });

  // ============================================================
  // Step 7: Verify Transfer FROM Blacklisted User Fails
  // ============================================================

  it("reject transfer from blacklisted sender", async () => {
    try {
      const ix = await createTransferCheckedWithTransferHookInstruction(
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
        errStr.includes("failed") ||
          errStr.includes("Blacklisted") ||
          errStr.includes("Error")
      ).to.equal(true);
    }
  });

  // ============================================================
  // Step 8: Verify Transfer TO Blacklisted User Fails
  // ============================================================

  it("reject transfer to blacklisted receiver", async () => {
    // userB has 5M tokens, try to send to blacklisted userA
    try {
      const ix = await createTransferCheckedWithTransferHookInstruction(
        provider.connection,
        ataB,
        mint.publicKey,
        ataA,
        userB.publicKey,
        BigInt(100),
        6,
        undefined,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new Transaction().add(ix), [userB]);
      expect.fail("Should have thrown — receiver is blacklisted");
    } catch (e: any) {
      const errStr = e.toString();
      expect(
        errStr.includes("failed") ||
          errStr.includes("Blacklisted") ||
          errStr.includes("Error")
      ).to.equal(true);
    }
  });

  // ============================================================
  // Step 9: Seize Tokens from Blacklisted userA
  // ============================================================

  it("seize tokens from blacklisted user to treasury", async () => {
    const accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const seizeAmount = Number(accountA.amount);
    expect(seizeAmount).to.be.greaterThan(0);

    const seizerRole = rolePda(5, authority.publicKey);
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
        fromOwner: userA.publicKey,
        blacklistEntry: senderBlPda,
        to: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: hookProgram.programId, isSigner: false, isWritable: false },
        {
          pubkey: extraAccountMetasPda,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: senderBlPda, isSigner: false, isWritable: false },
        { pubkey: receiverBlPda, isSigner: false, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
      ])
      .rpc();
    await provider.connection.confirmTransaction(seizeSig, "confirmed");

    // Verify userA balance is 0
    const afterA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(afterA.amount)).to.equal(0);
  });

  // ============================================================
  // Step 10: Verify Seized Tokens Went to Treasury
  // ============================================================

  it("verify seized tokens arrived at authority ATA", async () => {
    const authorityAccount = await getAccount(
      provider.connection,
      authorityAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    // userA had 50M - 5M = 45M tokens before seize
    expect(Number(authorityAccount.amount)).to.equal(45_000_000);
  });

  // ============================================================
  // Step 11: Remove from Blacklist
  // ============================================================

  it("remove userA from blacklist", async () => {
    const blacklisterRole = rolePda(4, authority.publicKey);
    const blEntryA = blacklistPda(userA.publicKey);

    const rmSig = await program.methods
      .removeFromBlacklist(userA.publicKey)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mint.publicKey,
      })
      .signers([])
      .rpc();
    await provider.connection.confirmTransaction(rmSig, "confirmed");

    // Verify blacklist entry is closed
    const blInfo = await provider.connection.getAccountInfo(blEntryA);
    expect(blInfo).to.be.null;
  });

  // ============================================================
  // Step 12: Verify Transfer Works Again After Unblacklist
  // ============================================================

  it("transfer succeeds after removing from blacklist", async () => {
    // Mint fresh tokens to userA
    const minterRole = rolePda(0, minter.publicKey);
    const mint2Sig = await program.methods
      .mint(new anchor.BN(2_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mint.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(mint2Sig, "confirmed");

    // Ensure ataA is thawed (mint may auto-thaw)
    await thawIfFrozen(ataA);

    // Transfer from userA to userB
    const ix = await createTransferCheckedWithTransferHookInstruction(
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
    const txSig = await provider.sendAndConfirm(
      new Transaction().add(ix),
      [userA]
    );
    await provider.connection.confirmTransaction(txSig, "confirmed");

    const accountB = await getAccount(
      provider.connection,
      ataB,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    // userB had 5M from step 5, now +1M
    expect(Number(accountB.amount)).to.equal(6_000_000);
  });

  // ============================================================
  // Final State Verification
  // ============================================================

  it("verify final state integrity", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.enableTransferHook).to.equal(true);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.paused).to.equal(false);

    // userA: 2M minted - 1M transferred = 1M
    const accountA = await getAccount(
      provider.connection,
      ataA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountA.amount)).to.equal(1_000_000);

    // userB: 5M + 1M = 6M
    const accountB = await getAccount(
      provider.connection,
      ataB,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(accountB.amount)).to.equal(6_000_000);

    // authority: 45M from seize
    const authorityAccount = await getAccount(
      provider.connection,
      authorityAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(authorityAccount.amount)).to.equal(45_000_000);
  });
});
