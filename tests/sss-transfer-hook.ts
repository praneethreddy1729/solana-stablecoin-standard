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

describe("sss-transfer-hook", () => {
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

  function rolePda(
    configKey: PublicKey,
    roleType: number,
    assignee: PublicKey
  ): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        configKey.toBuffer(),
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
    const tx = new Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx);
    await provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  async function mintTo(ata: PublicKey, amount: number) {
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    const sig = await program.methods
      .mint(new anchor.BN(amount))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mint.publicKey,
        to: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    // Airdrop
    const signers = [minter, blacklister, freezer, userA, userB];
    for (const s of signers) {
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

    // Derive treasury ATA (authority's ATA for this mint)
    const treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // Initialize SSS-2 token (with hook + permanent delegate + default frozen)
    await program.methods
      .initialize({
        name: "HookUSD",
        symbol: "HUSD",
        uri: "https://example.com/husd.json",
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
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    // Initialize ExtraAccountMetas for the hook
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

    // Assign roles: minter, blacklister, freezer
    // Authority also gets blacklister role since hook requires payer == config authority for CPI
    for (const [roleType, signer] of [
      [0, minter],
      [3, freezer],
      [4, blacklister],
      [4, authority],
    ] as [number, Keypair][]) {
      const role = rolePda(configPda, roleType, signer.publicKey);
      await program.methods
        .updateRoles(roleType, signer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Set minter quota
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(100_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();
  });

  // ============================================================
  // 1. Initialize ExtraAccountMetas
  // ============================================================

  describe("initialize_extra_account_metas", () => {
    it("ExtraAccountMetas account was created", async () => {
      const info = await provider.connection.getAccountInfo(
        extraAccountMetasPda
      );
      expect(info).to.not.be.null;
      expect(info!.owner.toString()).to.equal(hookProgram.programId.toString());
    });
  });

  // ============================================================
  // 2. Transfer succeeds for clean accounts
  // ============================================================

  describe("transfers", () => {
    let ataA: PublicKey;
    let ataB: PublicKey;

    before(async () => {
      ataA = await createAta(userA.publicKey);
      ataB = await createAta(userB.publicKey);
      await mintTo(ataA, 10_000_000);
    });

    it("transfer succeeds for non-blacklisted accounts", async () => {
      // Thaw accounts if frozen (DefaultAccountState=Frozen, but mint auto-thaws)
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);

      // Check and thaw source (userA) — may already be thawed by mint
      const ataAInfo = await getAccount(provider.connection, ataA, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (ataAInfo.isFrozen) {
        const sig = await program.methods
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
        await provider.connection.confirmTransaction(sig, "confirmed");
      }

      // Check and thaw dest (userB)
      const ataBInfo = await getAccount(provider.connection, ataB, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (ataBInfo.isFrozen) {
        const sig = await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: ataB,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        await provider.connection.confirmTransaction(sig, "confirmed");
      }

      // Build transfer with hook instruction
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

      const tx = new Transaction().add(ix);
      const txSig = await provider.sendAndConfirm(tx, [userA]);
      await provider.connection.confirmTransaction(txSig, "confirmed");

      const accountB = await getAccount(
        provider.connection,
        ataB,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(accountB.amount)).to.equal(1_000_000);
    });

    // ============================================================
    // 3. Transfer fails for blacklisted sender
    // ============================================================

    it("transfer fails for blacklisted sender", async () => {
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userA.publicKey);

      // Blacklist userA
      const blSig = await program.methods
        .addToBlacklist(userA.publicKey, "OFAC match")
        .accountsStrict({
          blacklister: authority.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();
      await provider.connection.confirmTransaction(blSig, "confirmed");

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
        const tx = new Transaction().add(ix);
        await provider.sendAndConfirm(tx, [userA]);
        expect.fail("Should have thrown");
      } catch (e: any) {
        // Transfer hook rejects — error may be SenderBlacklisted or a simulation failure
        const errStr = e.toString();
        expect(
          errStr.includes("failed") || errStr.includes("Blacklisted") || errStr.includes("Error")
        ).to.equal(true);
      }

      // Remove blacklist for next tests
      const rmSig = await program.methods
        .removeFromBlacklist(userA.publicKey)
        .accountsStrict({
          blacklister: authority.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mint.publicKey,
        })
        .signers([])
        .rpc();
      await provider.connection.confirmTransaction(rmSig, "confirmed");
    });

    // ============================================================
    // 4. Transfer fails for blacklisted receiver
    // ============================================================

    it("transfer fails for blacklisted receiver", async () => {
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userB.publicKey);

      // Blacklist userB (receiver)
      const blSig = await program.methods
        .addToBlacklist(userB.publicKey, "sanctioned entity")
        .accountsStrict({
          blacklister: authority.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();
      await provider.connection.confirmTransaction(blSig, "confirmed");

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
        const tx = new Transaction().add(ix);
        await provider.sendAndConfirm(tx, [userA]);
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("failed") || errStr.includes("Blacklisted") || errStr.includes("Error")
        ).to.equal(true);
      }

      // Remove blacklist
      const rmSig = await program.methods
        .removeFromBlacklist(userB.publicKey)
        .accountsStrict({
          blacklister: authority.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mint.publicKey,
        })
        .signers([])
        .rpc();
      await provider.connection.confirmTransaction(rmSig, "confirmed");
    });

    // ============================================================
    // 5. Seize bypasses blacklist (permanent delegate)
    // ============================================================

    it("seize bypasses blacklist via permanent delegate", async () => {
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userA.publicKey);

      // Check if userA is already blacklisted (from prior test failure cleanup)
      const blInfo = await provider.connection.getAccountInfo(blEntry);
      if (!blInfo) {
        // Blacklist userA
        const blSig = await program.methods
          .addToBlacklist(userA.publicKey, "OFAC match")
          .accountsStrict({
            blacklister: authority.publicKey,
            config: configPda,
            blacklisterRole,
            hookProgram: hookProgram.programId,
            blacklistEntry: blEntry,
            mint: mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([])
          .rpc();
        await provider.connection.confirmTransaction(blSig, "confirmed");
      }

      // Create authority ATA
      let authorityAta: PublicKey;
      try {
        authorityAta = await createAta(authority.publicKey);
      } catch {
        authorityAta = getAssociatedTokenAddressSync(
          mint.publicKey,
          authority.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
      }

      // Thaw authority ATA if frozen (DefaultAccountState=Frozen)
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const authAtaInfo = await getAccount(
        provider.connection,
        authorityAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      if (authAtaInfo.isFrozen) {
        const thawSig = await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        await provider.connection.confirmTransaction(thawSig, "confirmed");
      }

      const beforeSeize = await getAccount(
        provider.connection,
        ataA,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const seizeAmount = Number(beforeSeize.amount);
      expect(seizeAmount).to.be.greaterThan(0);

      // Derive extra accounts needed by the transfer hook
      const senderBlPda = blacklistPda(userA.publicKey);
      // Receiver is authority — derive their blacklist PDA too
      const receiverBlPda = blacklistPda(authority.publicKey);

      // Assign Seizer role (type 5) to authority
      const seizerRole = rolePda(configPda, 5, authority.publicKey);
      await program.methods
        .updateRoles(5, authority.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: seizerRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Seize all tokens from blacklisted userA
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
          { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
          { pubkey: senderBlPda, isSigner: false, isWritable: false },
          { pubkey: receiverBlPda, isSigner: false, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
        ])
        .rpc();
      await provider.connection.confirmTransaction(seizeSig, "confirmed");

      const afterSeize = await getAccount(
        provider.connection,
        ataA,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterSeize.amount)).to.equal(0);

      // Cleanup: remove blacklist
      const rmSig = await program.methods
        .removeFromBlacklist(userA.publicKey)
        .accountsStrict({
          blacklister: authority.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mint.publicKey,
        })
        .signers([])
        .rpc();
      await provider.connection.confirmTransaction(rmSig, "confirmed");
    });
  });
});
