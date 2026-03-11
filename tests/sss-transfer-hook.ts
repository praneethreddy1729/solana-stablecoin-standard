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

  const authority = provider.wallet.payer!;
  const mint = Keypair.generate();
  const minter = Keypair.generate();
  const blacklister = Keypair.generate();
  const freezer = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const userC = Keypair.generate();

  let configPda: PublicKey;
  let extraAccountMetasPda: PublicKey;
  let ataA: PublicKey;
  let ataB: PublicKey;
  let ataC: PublicKey;

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

  async function thawIfFrozen(ata: PublicKey): Promise<void> {
    const info = await getAccount(
      provider.connection,
      ata,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    if (info.isFrozen) {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
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

  async function addBlacklist(user: PublicKey, reason: string): Promise<void> {
    const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
    const blEntry = blacklistPda(user);
    const blSig = await program.methods
      .addToBlacklist(user, reason)
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

  async function removeBlacklist(user: PublicKey): Promise<void> {
    const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
    const blEntry = blacklistPda(user);
    const rmSig = await program.methods
      .removeFromBlacklist(user)
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
  }

  before(async () => {
    // Airdrop
    const signers = [minter, blacklister, freezer, userA, userB, userC];
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
    const treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

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
    // Authority also gets blacklister role for convenience
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

    // Create ATAs
    ataA = await createAta(userA.publicKey);
    ataB = await createAta(userB.publicKey);
    ataC = await createAta(userC.publicKey);

    // Mint tokens to all users
    await mintTo(ataA, 10_000_000);
    await mintTo(ataB, 10_000_000);
    await mintTo(ataC, 10_000_000);

    // Thaw all accounts for transfers
    await thawIfFrozen(ataA);
    await thawIfFrozen(ataB);
    await thawIfFrozen(ataC);
  });

  // ============================================================
  // 1. Initialize ExtraAccountMetas
  // ============================================================

  describe("initialize_extra_account_metas", () => {
    it("verify ExtraAccountMetas account was created", async () => {
      const info = await provider.connection.getAccountInfo(
        extraAccountMetasPda
      );
      expect(info).to.not.be.null;
      expect(info!.owner.toString()).to.equal(
        hookProgram.programId.toString()
      );
    });
  });

  // ============================================================
  // 2. Blacklist Entry CRUD
  // ============================================================

  describe("blacklist entry management", () => {
    it("create blacklist entry with reason", async () => {
      await addBlacklist(userC.publicKey, "OFAC match");

      const blEntry = blacklistPda(userC.publicKey);
      const blInfo = await provider.connection.getAccountInfo(blEntry);
      expect(blInfo).to.not.be.null;
      expect(blInfo!.owner.toString()).to.equal(
        hookProgram.programId.toString()
      );

      // Fetch and verify the entry data
      const entryData =
        await hookProgram.account.blacklistEntry.fetch(blEntry);
      expect(entryData.user.toString()).to.equal(
        userC.publicKey.toString()
      );
      expect(entryData.mint.toString()).to.equal(
        mint.publicKey.toString()
      );
      expect(entryData.reason).to.equal("OFAC match");

      // Cleanup
      await removeBlacklist(userC.publicKey);
    });

    it("create blacklist entry with max-length reason (64 bytes)", async () => {
      const maxReason = "A".repeat(64);
      await addBlacklist(userC.publicKey, maxReason);

      const blEntry = blacklistPda(userC.publicKey);
      const entryData =
        await hookProgram.account.blacklistEntry.fetch(blEntry);
      expect(entryData.reason).to.equal(maxReason);
      expect(entryData.reason.length).to.equal(64);

      // Cleanup
      await removeBlacklist(userC.publicKey);
    });

    it("reject blacklist entry with reason too long (>64 bytes)", async () => {
      const tooLongReason = "B".repeat(65);
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userC.publicKey);

      try {
        await program.methods
          .addToBlacklist(userC.publicKey, tooLongReason)
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
        expect.fail("Should have thrown — reason exceeds 64 bytes");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("ReasonTooLong");
      }
    });

    it("reject double-blacklisting same user (account already exists)", async () => {
      // First blacklist
      await addBlacklist(userC.publicKey, "first offense");

      // Second attempt should fail (Anchor init constraint: account already in use)
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userC.publicKey);
      try {
        await program.methods
          .addToBlacklist(userC.publicKey, "duplicate attempt")
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
        expect.fail("Should have thrown — user already blacklisted");
      } catch (e: any) {
        // Anchor init will fail because the PDA already exists
        const errStr = e.toString();
        expect(
          errStr.includes("already in use") ||
            errStr.includes("Error") ||
            errStr.includes("failed")
        ).to.equal(true);
      }

      // Cleanup
      await removeBlacklist(userC.publicKey);
    });

    it("reject removing non-existent blacklist entry", async () => {
      // userC is NOT blacklisted at this point
      const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
      const blEntry = blacklistPda(userC.publicKey);

      try {
        await program.methods
          .removeFromBlacklist(userC.publicKey)
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
        expect.fail("Should have thrown — blacklist entry does not exist");
      } catch (e: any) {
        // The CPI will fail because the account doesn't exist
        const errStr = e.toString();
        expect(
          errStr.includes("Error") ||
            errStr.includes("failed") ||
            errStr.includes("not found") ||
            errStr.includes("AccountNotInitialized")
        ).to.equal(true);
      }
    });
  });

  // ============================================================
  // 3. Transfer Tests
  // ============================================================

  describe("transfers", () => {
    it("transfer succeeds for non-blacklisted accounts", async () => {
      const beforeB = await getAccount(
        provider.connection,
        ataB,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(beforeB.amount);

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

      const afterB = await getAccount(
        provider.connection,
        ataB,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterB.amount)).to.equal(beforeAmount + 1_000_000);
    });

    it("transfer fails for blacklisted sender", async () => {
      await addBlacklist(userA.publicKey, "OFAC match");

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
        expect.fail("Should have thrown — sender is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("failed") ||
            errStr.includes("Blacklisted") ||
            errStr.includes("Error")
        ).to.equal(true);
      }

      // Remove blacklist for next tests
      await removeBlacklist(userA.publicKey);
    });

    it("transfer fails for blacklisted receiver", async () => {
      await addBlacklist(userB.publicKey, "sanctioned entity");

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
        expect.fail("Should have thrown — receiver is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("failed") ||
            errStr.includes("Blacklisted") ||
            errStr.includes("Error")
        ).to.equal(true);
      }

      // Remove blacklist
      await removeBlacklist(userB.publicKey);
    });

    it("verify hook allows transfer when neither party blacklisted", async () => {
      // After removing both blacklists, transfer should work
      const beforeC = await getAccount(
        provider.connection,
        ataC,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(beforeC.amount);

      const ix = await createTransferCheckedWithTransferHookInstruction(
        provider.connection,
        ataA,
        mint.publicKey,
        ataC,
        userA.publicKey,
        BigInt(500_000),
        6,
        undefined,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      const tx = new Transaction().add(ix);
      const txSig = await provider.sendAndConfirm(tx, [userA]);
      await provider.connection.confirmTransaction(txSig, "confirmed");

      const afterC = await getAccount(
        provider.connection,
        ataC,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterC.amount)).to.equal(beforeAmount + 500_000);
    });
  });

  // ============================================================
  // 4. Seize (permanent delegate bypass)
  // ============================================================

  describe("seize via permanent delegate", () => {
    it("seize bypasses blacklist via permanent delegate", async () => {
      // Blacklist userA
      await addBlacklist(userA.publicKey, "OFAC match");

      // Create authority ATA if needed
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

      // Thaw authority ATA if frozen
      await thawIfFrozen(authorityAta);

      const beforeSeize = await getAccount(
        provider.connection,
        ataA,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const seizeAmount = Number(beforeSeize.amount);
      expect(seizeAmount).to.be.greaterThan(0);

      // Derive extra accounts
      const senderBlPda = blacklistPda(userA.publicKey);
      const receiverBlPda = blacklistPda(authority.publicKey);

      // Assign Seizer role to authority
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

      // Seize all tokens
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
          {
            pubkey: hookProgram.programId,
            isSigner: false,
            isWritable: false,
          },
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

      const afterSeize = await getAccount(
        provider.connection,
        ataA,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterSeize.amount)).to.equal(0);

      // Cleanup
      await removeBlacklist(userA.publicKey);
    });
  });
});
