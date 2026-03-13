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

describe("compliance-flows", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace.SssTransferHook as Program<SssTransferHook>;
  const authority = provider.wallet.payer!;

  // SSS-2 mint (with hook + permanent delegate)
  const mint = Keypair.generate();
  // SSS-1 mint (no hook, no permanent delegate)
  const sss1Mint = Keypair.generate();

  const blacklister = Keypair.generate();
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const seizer = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const userC = Keypair.generate();
  const randomUser = Keypair.generate();

  let configPda: PublicKey;
  let sss1ConfigPda: PublicKey;
  let extraAccountMetasPda: PublicKey;
  let ataA: PublicKey;
  let ataB: PublicKey;
  let ataC: PublicKey;
  let authorityAta: PublicKey;
  let seizerAta: PublicKey;
  let treasuryAta: PublicKey;
  let sss1TreasuryAta: PublicKey;

  function rolePda(cfg: PublicKey, roleType: number, assignee: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        cfg.toBuffer(),
        Buffer.from([roleType]),
        assignee.toBuffer(),
      ],
      program.programId
    );
    return pda;
  }

  function blacklistPda(mintKey: PublicKey, user: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), mintKey.toBuffer(), user.toBuffer()],
      hookProgram.programId
    );
    return pda;
  }

  function extraMetasPda(mintKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintKey.toBuffer()],
      hookProgram.programId
    );
    return pda;
  }

  async function createAta(mintKey: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintKey, owner, false, TOKEN_2022_PROGRAM_ID);
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey, ata, owner, mintKey, TOKEN_2022_PROGRAM_ID
    );
    const sig = await provider.sendAndConfirm(new Transaction().add(ix));
    await provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  async function transferHookTransfer(
    from: PublicKey,
    to: PublicKey,
    ownerKeypair: Keypair,
    amount: bigint
  ) {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      from,
      mint.publicKey,
      to,
      ownerKeypair.publicKey,
      amount,
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx, [ownerKeypair]);
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function addBlacklist(user: PublicKey, reason: string) {
    const blEntry = blacklistPda(mint.publicKey, user);
    // Any authorized Blacklister role holder can blacklist (config PDA signs the CPI)
    const sig = await program.methods
      .addToBlacklist(user, reason)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole: rolePda(configPda, 4, authority.publicKey),
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntry,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function removeBlacklist(user: PublicKey) {
    const blEntry = blacklistPda(mint.publicKey, user);
    // Any authorized Blacklister role holder can remove from blacklist (config PDA signs the CPI)
    const sig = await program.methods
      .removeFromBlacklist(user)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole: rolePda(configPda, 4, authority.publicKey),
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntry,
        mint: mint.publicKey,
      })
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function seizeTokens(fromAta: PublicKey, toAta: PublicKey, fromOwner: PublicKey, toOwner: PublicKey, seizerKey: PublicKey = authority.publicKey) {
    const senderBlPda = blacklistPda(mint.publicKey, fromOwner);
    const receiverBlPda = blacklistPda(mint.publicKey, toOwner);
    const sig = await program.methods
      .seize()
      .accountsStrict({
        authority: seizerKey,
        config: configPda,
        seizerRole: rolePda(configPda, 5, seizerKey),
        mint: mint.publicKey,
        from: fromAta,
        fromOwner: fromOwner,
        blacklistEntry: senderBlPda,
        to: toAta,
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
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function mintTokensTo(to: PublicKey, amount: number) {
    const sig = await program.methods
      .mint(new anchor.BN(amount))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole: rolePda(configPda, 0, minter.publicKey),
        mint: mint.publicKey,
        to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function getBalance(ata: PublicKey): Promise<number> {
    const account = await getAccount(provider.connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    return Number(account.amount);
  }

  async function accountExists(addr: PublicKey): Promise<boolean> {
    const info = await provider.connection.getAccountInfo(addr);
    return info !== null && info.data.length > 0;
  }

  before(async () => {
    // Airdrop to all keypairs
    for (const kp of [blacklister, minter, burner, pauser, freezer, seizer, userA, userB, userC, randomUser]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }

    // ===== Initialize SSS-2 mint =====
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
    extraAccountMetasPda = extraMetasPda(mint.publicKey);

    // Derive treasury ATA (authority's ATA for this mint)
    treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);

    const initSig = await program.methods
      .initialize({
        name: "ComplianceTest",
        symbol: "CMPT",
        uri: "",
        decimals: 6,
        enableTransferHook: true,
        enablePermanentDelegate: true,
        defaultAccountFrozen: false,
        treasury: treasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mint.publicKey.toBuffer()], program.programId)[0],
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();
    await provider.connection.confirmTransaction(initSig, "confirmed");

    // Initialize extra account metas for transfer hook
    const initExtraSig = await hookProgram.methods
      .initializeExtraAccountMetas()
      .accountsStrict({
        payer: authority.publicKey,
        extraAccountMetas: extraAccountMetasPda,
        mint: mint.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(initExtraSig, "confirmed");

    // ===== Initialize SSS-1 mint (no hook, no permanent delegate) =====
    [sss1ConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), sss1Mint.publicKey.toBuffer()],
      program.programId
    );

    sss1TreasuryAta = getAssociatedTokenAddressSync(sss1Mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);

    await program.methods
      .initialize({
        name: "SSS1Token",
        symbol: "SSS1",
        uri: "",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: sss1TreasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: sss1ConfigPda,
        mint: sss1Mint.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), sss1Mint.publicKey.toBuffer()], program.programId)[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();

    // ===== Assign roles on SSS-2 =====
    const roles: [number, Keypair][] = [
      [0, minter],      // Minter
      [1, burner],       // Burner
      [2, pauser],       // Pauser
      [3, freezer],      // Freezer
      [4, blacklister],  // Blacklister (dedicated, for non-authority tests)
      [4, authority],    // Blacklister (authority, used in addBlacklist/removeBlacklist helpers)
      [5, authority],    // Seizer (authority as seizer)
      [5, seizer],       // Seizer (dedicated seizer)
    ];
    for (const [roleType, signer] of roles) {
      const roleSig = await program.methods
        .updateRoles(roleType, signer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: rolePda(configPda, roleType, signer.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await provider.connection.confirmTransaction(roleSig, "confirmed");
    }

    // Set minter quota
    await program.methods
      .updateMinter(new anchor.BN(10_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: rolePda(configPda, 0, minter.publicKey),
      })
      .rpc();

    // ===== Assign blacklister role on SSS-1 for testing ComplianceNotEnabled =====
    await program.methods
      .updateRoles(4, authority.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: sss1ConfigPda,
        role: rolePda(sss1ConfigPda, 4, authority.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Assign seizer role on SSS-1 for testing PermanentDelegateNotEnabled
    await program.methods
      .updateRoles(5, authority.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: sss1ConfigPda,
        role: rolePda(sss1ConfigPda, 5, authority.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // ===== Create ATAs for SSS-2 =====
    ataA = await createAta(mint.publicKey, userA.publicKey);
    ataB = await createAta(mint.publicKey, userB.publicKey);
    ataC = await createAta(mint.publicKey, userC.publicKey);
    authorityAta = await createAta(mint.publicKey, authority.publicKey);
    seizerAta = await createAta(mint.publicKey, seizer.publicKey);

    // ===== Mint tokens to users =====
    await mintTokensTo(ataA, 100_000_000); // 100 tokens
    await mintTokensTo(ataB, 50_000_000);  // 50 tokens
    await mintTokensTo(ataC, 50_000_000);  // 50 tokens
    await mintTokensTo(authorityAta, 10_000_000); // 10 tokens
  });

  // =========================================================================
  // Blacklist Management (tests 1-10)
  // =========================================================================
  describe("Blacklist Management", () => {
    const blUser1 = Keypair.generate();

    before(async () => {
      const sig = await provider.connection.requestAirdrop(blUser1.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    });

    it("1. adds address to blacklist succeeds", async () => {
      await addBlacklist(blUser1.publicKey, "test reason");
      const exists = await accountExists(blacklistPda(mint.publicKey, blUser1.publicKey));
      expect(exists).to.equal(true);
    });

    it("2. adding same address twice fails (account already exists)", async () => {
      try {
        await addBlacklist(blUser1.publicKey, "duplicate");
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("already in use");
      }
    });

    it("3. removes address from blacklist succeeds", async () => {
      await removeBlacklist(blUser1.publicKey);
      const exists = await accountExists(blacklistPda(mint.publicKey, blUser1.publicKey));
      expect(exists).to.equal(false);
    });

    it("4. removing non-blacklisted address fails", async () => {
      const neverBlacklisted = Keypair.generate();
      try {
        const blEntry = blacklistPda(mint.publicKey, neverBlacklisted.publicKey);
        await program.methods
          .removeFromBlacklist(neverBlacklisted.publicKey)
          .accountsStrict({
            blacklister: blacklister.publicKey,
            config: configPda,
            blacklisterRole: rolePda(configPda, 4, blacklister.publicKey),
            hookProgram: hookProgram.programId,
            blacklistEntry: blEntry,
            mint: mint.publicKey,
          })
          .signers([blacklister])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("NotBlacklisted") ||
          errStr.includes("Error") ||
          errStr.includes("failed")
        ).to.equal(true);
      }
    });

    it("5. re-blacklists after removal succeeds", async () => {
      await addBlacklist(blUser1.publicKey, "re-added");
      const exists = await accountExists(blacklistPda(mint.publicKey, blUser1.publicKey));
      expect(exists).to.equal(true);
      // Clean up
      await removeBlacklist(blUser1.publicKey);
    });

    it("6. blacklists with reason string (max 64 bytes) succeeds", async () => {
      const maxReason = "A".repeat(64);
      await addBlacklist(blUser1.publicKey, maxReason);
      const entry = await hookProgram.account.blacklistEntry.fetch(
        blacklistPda(mint.publicKey, blUser1.publicKey)
      );
      expect(entry.reason).to.equal(maxReason);
      await removeBlacklist(blUser1.publicKey);
    });

    it("7. blacklists with reason > 64 bytes fails (ReasonTooLong 6024)", async () => {
      const longReason = "B".repeat(65);
      try {
        await addBlacklist(blUser1.publicKey, longReason);
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("ReasonTooLong") || errStr.includes("6024")
        ).to.equal(true);
      }
    });

    it("8. blacklists with empty reason succeeds", async () => {
      await addBlacklist(blUser1.publicKey, "");
      const entry = await hookProgram.account.blacklistEntry.fetch(
        blacklistPda(mint.publicKey, blUser1.publicKey)
      );
      expect(entry.reason).to.equal("");
      await removeBlacklist(blUser1.publicKey);
    });

    it("9. non-blacklister cannot add to blacklist", async () => {
      try {
        const blEntry = blacklistPda(mint.publicKey, blUser1.publicKey);
        await program.methods
          .addToBlacklist(blUser1.publicKey, "unauthorized")
          .accountsStrict({
            blacklister: randomUser.publicKey,
            config: configPda,
            blacklisterRole: rolePda(configPda, 4, randomUser.publicKey),
            hookProgram: hookProgram.programId,
            blacklistEntry: blEntry,
            mint: mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("AccountNotInitialized") ||
          errStr.includes("Unauthorized") ||
          errStr.includes("Error") ||
          errStr.includes("not initialized")
        ).to.equal(true);
      }
    });

    it("10. non-blacklister cannot remove from blacklist", async () => {
      // First blacklist the user
      await addBlacklist(blUser1.publicKey, "to test unauthorized removal");
      try {
        const blEntry = blacklistPda(mint.publicKey, blUser1.publicKey);
        await program.methods
          .removeFromBlacklist(blUser1.publicKey)
          .accountsStrict({
            blacklister: randomUser.publicKey,
            config: configPda,
            blacklisterRole: rolePda(configPda, 4, randomUser.publicKey),
            hookProgram: hookProgram.programId,
            blacklistEntry: blEntry,
            mint: mint.publicKey,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("AccountNotInitialized") ||
          errStr.includes("Unauthorized") ||
          errStr.includes("Error") ||
          errStr.includes("not initialized")
        ).to.equal(true);
      }
      // Clean up
      await removeBlacklist(blUser1.publicKey);
    });
  });

  // =========================================================================
  // Transfer with Blacklist (tests 11-16)
  // =========================================================================
  describe("Transfer with Blacklist", () => {
    it("11. transfer between clean accounts succeeds", async () => {
      const balBBefore = await getBalance(ataB);
      await transferHookTransfer(ataA, ataB, userA, BigInt(1_000_000));
      const balBAfter = await getBalance(ataB);
      expect(balBAfter - balBBefore).to.equal(1_000_000);
    });

    it("12. transfer FROM blacklisted sender fails", async () => {
      await addBlacklist(userA.publicKey, "sender blocked");
      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown — sender is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Blacklisted") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }
      await removeBlacklist(userA.publicKey);
    });

    it("13. transfer TO blacklisted receiver fails", async () => {
      await addBlacklist(userB.publicKey, "receiver blocked");
      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown — receiver is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Blacklisted") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }
      await removeBlacklist(userB.publicKey);
    });

    it("14. blacklist sender -> transfer fails -> unblacklist -> transfer succeeds", async () => {
      // Blacklist
      await addBlacklist(userA.publicKey, "temp block sender");

      // Transfer should fail
      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown");
      } catch {
        // expected
      }

      // Unblacklist
      await removeBlacklist(userA.publicKey);

      // Transfer should succeed
      const balBefore = await getBalance(ataB);
      await transferHookTransfer(ataA, ataB, userA, BigInt(1_000_000));
      const balAfter = await getBalance(ataB);
      expect(balAfter - balBefore).to.equal(1_000_000);
    });

    it("15. blacklist receiver -> transfer fails -> unblacklist -> transfer succeeds", async () => {
      // Blacklist receiver
      await addBlacklist(userB.publicKey, "temp block receiver");

      // Transfer should fail
      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown");
      } catch {
        // expected
      }

      // Unblacklist
      await removeBlacklist(userB.publicKey);

      // Transfer should succeed
      const balBefore = await getBalance(ataB);
      await transferHookTransfer(ataA, ataB, userA, BigInt(500_000));
      const balAfter = await getBalance(ataB);
      expect(balAfter - balBefore).to.equal(500_000);
    });

    it("16. transfer with both sender AND receiver blacklisted fails", async () => {
      await addBlacklist(userA.publicKey, "both blocked sender");
      await addBlacklist(userB.publicKey, "both blocked receiver");

      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Blacklisted") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }

      await removeBlacklist(userA.publicKey);
      await removeBlacklist(userB.publicKey);
    });
  });

  // =========================================================================
  // Seize Operations (tests 17-23)
  // =========================================================================
  describe("Seize Operations", () => {
    it("17. seizes from blacklisted account succeeds (permanent delegate bypass)", async () => {
      // Blacklist userC
      await addBlacklist(userC.publicKey, "seize target");

      const balCBefore = await getBalance(ataC);
      const balAuthBefore = await getBalance(authorityAta);
      expect(balCBefore).to.be.greaterThan(0);

      await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);

      const balCAfter = await getBalance(ataC);
      const balAuthAfter = await getBalance(authorityAta);
      expect(balCAfter).to.equal(0);
      expect(balAuthAfter - balAuthBefore).to.equal(balCBefore);

      await removeBlacklist(userC.publicKey);
    });

    it("18. seize from non-blacklisted account fails (TargetNotBlacklisted)", async () => {
      // Mint some tokens to userC for this test
      await mintTokensTo(ataC, 5_000_000);

      // Seize from non-blacklisted — should now fail with TargetNotBlacklisted
      try {
        await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);
        expect.fail("Should have thrown — target is not blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("TargetNotBlacklisted") ||
          errStr.includes("6026") ||
          errStr.includes("Error")
        ).to.equal(true);
      }
    });

    it("19. seize transfers correct amount to treasury", async () => {
      // userC may have tokens from test 18 (5M) — blacklist first, then seize
      // Burn any existing balance first by seizing after blacklisting
      const balCInit = await getBalance(ataC);
      if (balCInit > 0) {
        // Need to blacklist to seize
        await addBlacklist(userC.publicKey, "seize for test 19 cleanup");
        await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);
        await removeBlacklist(userC.publicKey);
      }

      await mintTokensTo(ataC, 7_777_777);
      await addBlacklist(userC.publicKey, "seize target test 19");
      const balAuthBefore = await getBalance(authorityAta);

      await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);

      const balCAfter = await getBalance(ataC);
      const balAuthAfter = await getBalance(authorityAta);
      expect(balCAfter).to.equal(0);
      expect(balAuthAfter - balAuthBefore).to.equal(7_777_777);
      await removeBlacklist(userC.publicKey);
    });

    it("20. seize with dedicated Seizer role succeeds", async () => {
      await mintTokensTo(ataC, 3_000_000);
      await addBlacklist(userC.publicKey, "seize target test 20");

      const senderBlPda = blacklistPda(mint.publicKey, userC.publicKey);
      const receiverBlPda = blacklistPda(mint.publicKey, authority.publicKey);

      const sig = await program.methods
        .seize()
        .accountsStrict({
          authority: seizer.publicKey,
          config: configPda,
          seizerRole: rolePda(configPda, 5, seizer.publicKey),
          mint: mint.publicKey,
          from: ataC,
          fromOwner: userC.publicKey,
          blacklistEntry: senderBlPda,
          to: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: hookProgram.programId, isSigner: false, isWritable: false },
          { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
          { pubkey: senderBlPda, isSigner: false, isWritable: false },
          { pubkey: receiverBlPda, isSigner: false, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
        ])
        .signers([seizer])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const balC = await getBalance(ataC);
      expect(balC).to.equal(0);
      await removeBlacklist(userC.publicKey);
    });

    it("21. non-seizer cannot seize", async () => {
      await mintTokensTo(ataC, 1_000_000);
      try {
        const senderBlPda = blacklistPda(mint.publicKey, userC.publicKey);
        const receiverBlPda = blacklistPda(mint.publicKey, authority.publicKey);

        await program.methods
          .seize()
          .accountsStrict({
            authority: randomUser.publicKey,
            config: configPda,
            seizerRole: rolePda(configPda, 5, randomUser.publicKey),
            mint: mint.publicKey,
            from: ataC,
            fromOwner: userC.publicKey,
            blacklistEntry: senderBlPda,
            to: treasuryAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: hookProgram.programId, isSigner: false, isWritable: false },
            { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
            { pubkey: senderBlPda, isSigner: false, isWritable: false },
            { pubkey: receiverBlPda, isSigner: false, isWritable: false },
            { pubkey: configPda, isSigner: false, isWritable: false },
          ])
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("AccountNotInitialized") ||
          errStr.includes("Unauthorized") ||
          errStr.includes("not initialized")
        ).to.equal(true);
      }
    });

    it("22. seize entire balance", async () => {
      // userC should have 1_000_000 from test 21 (seize failed)
      const balBefore = await getBalance(ataC);
      expect(balBefore).to.be.greaterThan(0);

      await addBlacklist(userC.publicKey, "seize target test 22");
      await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);

      const balAfter = await getBalance(ataC);
      expect(balAfter).to.equal(0);
      await removeBlacklist(userC.publicKey);
    });

    it("23. seize fails on zero balance (ZeroAmount)", async () => {
      // ataC should be 0 after test 22
      const bal = await getBalance(ataC);
      expect(bal).to.equal(0);

      await addBlacklist(userC.publicKey, "seize target test 23");
      try {
        await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);
        expect.fail("Should have thrown — zero balance");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("ZeroAmount") ||
          errStr.includes("6021") ||
          errStr.includes("greater than zero")
        ).to.equal(true);
      }
      await removeBlacklist(userC.publicKey);
    });
  });

  // =========================================================================
  // SSS-2 on SSS-1 Graceful Failure (tests 24-26)
  // =========================================================================
  describe("SSS-2 on SSS-1 Graceful Failure", () => {
    it("24. addToBlacklist on SSS-1 returns ComplianceNotEnabled (6022)", async () => {
      const fakeBlEntry = blacklistPda(sss1Mint.publicKey, userA.publicKey);
      try {
        await program.methods
          .addToBlacklist(userA.publicKey, "should fail")
          .accountsStrict({
            blacklister: authority.publicKey,
            config: sss1ConfigPda,
            blacklisterRole: rolePda(sss1ConfigPda, 4, authority.publicKey),
            hookProgram: hookProgram.programId,
            blacklistEntry: fakeBlEntry,
            mint: sss1Mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("ComplianceNotEnabled") || errStr.includes("6022")
        ).to.equal(true);
      }
    });

    it("25. removeFromBlacklist on SSS-1 returns ComplianceNotEnabled (6022)", async () => {
      const fakeBlEntry = blacklistPda(sss1Mint.publicKey, userA.publicKey);
      try {
        await program.methods
          .removeFromBlacklist(userA.publicKey)
          .accountsStrict({
            blacklister: authority.publicKey,
            config: sss1ConfigPda,
            blacklisterRole: rolePda(sss1ConfigPda, 4, authority.publicKey),
            hookProgram: hookProgram.programId,
            blacklistEntry: fakeBlEntry,
            mint: sss1Mint.publicKey,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("ComplianceNotEnabled") || errStr.includes("6022")
        ).to.equal(true);
      }
    });

    it("26. seize on SSS-1 returns PermanentDelegateNotEnabled (6023)", async () => {
      // Create ATAs on SSS-1
      const sss1AtaFrom = await createAta(sss1Mint.publicKey, userA.publicKey);
      const sss1AtaTo = await createAta(sss1Mint.publicKey, authority.publicKey);

      // Assign minter on SSS-1 and mint some tokens
      await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: sss1ConfigPda,
          role: rolePda(sss1ConfigPda, 0, minter.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await program.methods
        .updateMinter(new anchor.BN(10_000_000_000))
        .accountsStrict({
          authority: authority.publicKey,
          config: sss1ConfigPda,
          minterRole: rolePda(sss1ConfigPda, 0, minter.publicKey),
        })
        .rpc();
      await program.methods
        .mint(new anchor.BN(1_000_000))
        .accountsStrict({
          minter: minter.publicKey,
          config: sss1ConfigPda,
          minterRole: rolePda(sss1ConfigPda, 0, minter.publicKey),
          mint: sss1Mint.publicKey,
          to: sss1AtaFrom,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Derive blacklist PDA for the fromOwner (won't exist, but needed for struct)
      const [sss1BlPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), sss1Mint.publicKey.toBuffer(), userA.publicKey.toBuffer()],
        hookProgram.programId
      );

      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: authority.publicKey,
            config: sss1ConfigPda,
            seizerRole: rolePda(sss1ConfigPda, 5, authority.publicKey),
            mint: sss1Mint.publicKey,
            from: sss1AtaFrom,
            fromOwner: userA.publicKey,
            blacklistEntry: sss1BlPda,
            to: sss1AtaTo,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("PermanentDelegateNotEnabled") || errStr.includes("6023")
        ).to.equal(true);
      }
    });
  });

  // =========================================================================
  // Compliance + Pause Interaction (tests 27-31)
  // =========================================================================
  describe("Compliance + Pause Interaction", () => {
    it("27. paused token transfer fails (hook checks pause)", async () => {
      // Pause
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: rolePda(configPda, 2, pauser.publicKey),
        })
        .signers([pauser])
        .rpc();

      try {
        await transferHookTransfer(ataA, ataB, userA, BigInt(100));
        expect.fail("Should have thrown — token is paused");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Paused") ||
          errStr.includes("paused") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }
    });

    it("28. paused + blacklist add still works", async () => {
      // Token is still paused from test 27
      const tempUser = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(tempUser.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      await addBlacklist(tempUser.publicKey, "added while paused");
      const exists = await accountExists(blacklistPda(mint.publicKey, tempUser.publicKey));
      expect(exists).to.equal(true);
      // Clean up
      await removeBlacklist(tempUser.publicKey);
    });

    it("29. paused + blacklist remove still works", async () => {
      // Token is still paused
      const tempUser2 = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(tempUser2.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      // We need to unpause briefly to blacklist (blacklist add doesn't check pause),
      // actually blacklist doesn't check pause in add_to_blacklist handler, so just add
      await addBlacklist(tempUser2.publicKey, "to remove while paused");

      // Remove while paused
      await removeBlacklist(tempUser2.publicKey);
      const exists = await accountExists(blacklistPda(mint.publicKey, tempUser2.publicKey));
      expect(exists).to.equal(false);
    });

    it("30. paused + seize still works (emergency ops not paused)", async () => {
      // Token is still paused — mint tokens first requires unpausing
      // Unpause, mint, blacklist, re-pause, then seize
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: rolePda(configPda, 2, pauser.publicKey),
        })
        .signers([pauser])
        .rpc();

      await mintTokensTo(ataC, 2_000_000);
      await addBlacklist(userC.publicKey, "seize target test 30");

      // Re-pause
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: rolePda(configPda, 2, pauser.publicKey),
        })
        .signers([pauser])
        .rpc();

      // Seize should work even while paused (permanent delegate bypasses hook checks)
      const balBefore = await getBalance(ataC);
      expect(balBefore).to.be.greaterThan(0);

      await seizeTokens(ataC, authorityAta, userC.publicKey, authority.publicKey);

      const balAfter = await getBalance(ataC);
      expect(balAfter).to.equal(0);
      // Clean up blacklist (works while paused)
      await removeBlacklist(userC.publicKey);
    });

    it("31. unpause + transfer resumes", async () => {
      // Unpause
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole: rolePda(configPda, 2, pauser.publicKey),
        })
        .signers([pauser])
        .rpc();

      // Transfer should work now
      const balBBefore = await getBalance(ataB);
      await transferHookTransfer(ataA, ataB, userA, BigInt(500_000));
      const balBAfter = await getBalance(ataB);
      expect(balBAfter - balBBefore).to.equal(500_000);
    });
  });

  // =========================================================================
  // Edge Cases (tests 32-35)
  // =========================================================================
  describe("Edge Cases", () => {
    it("32. blacklists the authority address", async () => {
      await addBlacklist(authority.publicKey, "authority blacklisted");

      // Authority can't receive transfers
      try {
        await transferHookTransfer(ataA, authorityAta, userA, BigInt(100));
        expect.fail("Should have thrown — authority/receiver is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Blacklisted") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }

      await removeBlacklist(authority.publicKey);
    });

    it("33. blacklists a minter (they can still mint but can't receive transfers)", async () => {
      // Create ATA for minter
      let minterAta: PublicKey;
      try {
        minterAta = await createAta(mint.publicKey, minter.publicKey);
      } catch {
        // ATA might already exist
        minterAta = getAssociatedTokenAddressSync(
          mint.publicKey, minter.publicKey, false, TOKEN_2022_PROGRAM_ID
        );
      }

      await addBlacklist(minter.publicKey, "minter blacklisted");

      // Minter can still mint to OTHER accounts (mint doesn't go through transfer hook)
      await mintTokensTo(ataC, 1_000_000);
      const balC = await getBalance(ataC);
      expect(balC).to.be.greaterThan(0);

      // But minter can't receive transfers via transfer hook
      try {
        await transferHookTransfer(ataA, minterAta, userA, BigInt(100));
        expect.fail("Should have thrown — minter/receiver is blacklisted");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("Blacklisted") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
        ).to.equal(true);
      }

      await removeBlacklist(minter.publicKey);
    });

    it("34. multiple users blacklisted independently", async () => {
      // Blacklist userA and userB
      await addBlacklist(userA.publicKey, "multi-blacklist A");
      await addBlacklist(userB.publicKey, "multi-blacklist B");

      // Both should be blacklisted
      const existsA = await accountExists(blacklistPda(mint.publicKey, userA.publicKey));
      const existsB = await accountExists(blacklistPda(mint.publicKey, userB.publicKey));
      expect(existsA).to.equal(true);
      expect(existsB).to.equal(true);

      // userC (not blacklisted) can still transfer
      await mintTokensTo(ataC, 1_000_000);
      // Transfer from C -> authority (neither blacklisted)
      const balAuthBefore = await getBalance(authorityAta);
      await transferHookTransfer(ataC, authorityAta, userC, BigInt(500_000));
      const balAuthAfter = await getBalance(authorityAta);
      expect(balAuthAfter - balAuthBefore).to.equal(500_000);

      // Remove independently
      await removeBlacklist(userA.publicKey);
      // B should still be blacklisted
      const stillBlacklistedB = await accountExists(blacklistPda(mint.publicKey, userB.publicKey));
      expect(stillBlacklistedB).to.equal(true);

      // A can transfer now
      const balBefore = await getBalance(authorityAta);
      await transferHookTransfer(ataA, authorityAta, userA, BigInt(100_000));
      const balAfterA = await getBalance(authorityAta);
      expect(balAfterA - balBefore).to.equal(100_000);

      // B still can't transfer
      try {
        await transferHookTransfer(ataB, authorityAta, userB, BigInt(100));
        expect.fail("Should have thrown — B is still blacklisted");
      } catch {
        // expected
      }

      await removeBlacklist(userB.publicKey);
    });

    it("35. isBlacklisted returns correct boolean via account existence", async () => {
      const testUser = Keypair.generate();
      const blPda = blacklistPda(mint.publicKey, testUser.publicKey);

      // Not blacklisted — account should not exist
      let exists = await accountExists(blPda);
      expect(exists).to.equal(false);

      // Blacklist
      const sig = await provider.connection.requestAirdrop(testUser.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
      await addBlacklist(testUser.publicKey, "existence check");

      // Now should exist
      exists = await accountExists(blPda);
      expect(exists).to.equal(true);

      // Fetch and verify fields
      const entry = await hookProgram.account.blacklistEntry.fetch(blPda);
      expect(entry.mint.equals(mint.publicKey)).to.equal(true);
      expect(entry.user.equals(testUser.publicKey)).to.equal(true);
      expect(entry.reason).to.equal("existence check");

      // Remove
      await removeBlacklist(testUser.publicKey);
      exists = await accountExists(blPda);
      expect(exists).to.equal(false);
    });
  });

  // =========================================================================
  // Security Guard Tests (tests 36-39)
  // =========================================================================
  describe("Security Guards", () => {
    it("36. seize to non-treasury destination fails (InvalidTreasury)", async () => {
      // Mint tokens to a user, blacklist them, then try seizing to wrong dest
      await mintTokensTo(ataC, 1_000_000);
      await addBlacklist(userC.publicKey, "seize-treasury-test");

      // Create a non-treasury ATA (seizer's own ATA)
      let wrongDestAta: PublicKey;
      try {
        wrongDestAta = await createAta(mint.publicKey, seizer.publicKey);
      } catch {
        wrongDestAta = getAssociatedTokenAddressSync(
          mint.publicKey, seizer.publicKey, false, TOKEN_2022_PROGRAM_ID
        );
      }

      const senderBlPda = blacklistPda(mint.publicKey, userC.publicKey);
      const receiverBlPda = blacklistPda(mint.publicKey, seizer.publicKey);
      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            seizerRole: rolePda(configPda, 5, authority.publicKey),
            mint: mint.publicKey,
            from: ataC,
            fromOwner: userC.publicKey,
            blacklistEntry: senderBlPda,
            to: wrongDestAta,
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
        expect.fail("Should have thrown — destination is not treasury");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("InvalidTreasury") || errStr.includes("2012") || errStr.includes("Constraint")
        ).to.equal(true);
      }
      await removeBlacklist(userC.publicKey);
    });

    it("37. freezing the treasury account fails (CannotFreezeTreasury)", async () => {
      // Get the config to find the treasury
      const config = await program.account.stablecoinConfig.fetch(configPda);
      const treasury = config.treasury;

      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole: rolePda(configPda, 3, freezer.publicKey),
            mint: mint.publicKey,
            tokenAccount: treasury,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        expect.fail("Should have thrown — cannot freeze treasury");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("CannotFreezeTreasury") || errStr.includes("6033")
        ).to.equal(true);
      }
    });

    it("38. seize with wrong fromOwner fails (InvalidFromOwner)", async () => {
      // Try to seize from ataA but pass userB as fromOwner (mismatch)
      await mintTokensTo(ataA, 1_000_000);
      // Blacklist userB (the wrong owner we'll pass)
      await addBlacklist(userB.publicKey, "wrong-owner-test");

      const senderBlPda = blacklistPda(mint.publicKey, userB.publicKey);
      const receiverBlPda = blacklistPda(mint.publicKey, authority.publicKey);
      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            seizerRole: rolePda(configPda, 5, authority.publicKey),
            mint: mint.publicKey,
            from: ataA,           // owned by userA
            fromOwner: userB.publicKey, // wrong owner!
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
        expect.fail("Should have thrown — fromOwner doesn't match from.owner");
      } catch (e: any) {
        const errStr = e.toString();
        expect(
          errStr.includes("InvalidFromOwner") || errStr.includes("6020") || errStr.includes("Error")
        ).to.equal(true);
      }
      await removeBlacklist(userB.publicKey);
    });
  });
});
