import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("sss-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet.payer;
  const mint = Keypair.generate();

  // Role holders
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const recipient = Keypair.generate();

  // PDAs
  let configPda: PublicKey;
  let configBump: number;

  // Helper: derive role PDA
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

  // Helper: create ATA
  async function createAta(
    owner: PublicKey,
    payer: Keypair = authority
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx);
    return ata;
  }

  before(async () => {
    // Airdrop to all signers
    const signers = [minter, burner, pauser, freezer, blacklister, seizer, recipient];
    for (const signer of signers) {
      const sig = await provider.connection.requestAirdrop(
        signer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive config PDA
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
  });

  // ============================================================
  // 1. Initialize
  // ============================================================

  describe("initialize", () => {
    it("creates SSS-1 stablecoin (no hook, no delegate)", async () => {
      await program.methods
        .initialize({
          name: "TestUSD",
          symbol: "TUSD",
          uri: "https://example.com/tusd.json",
          decimals: 6,
          enableTransferHook: false,
          enablePermanentDelegate: false,
          defaultAccountFrozen: false,
        })
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          mint: mint.publicKey,
          hookProgram: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(config.mint.toString()).to.equal(mint.publicKey.toString());
      expect(config.decimals).to.equal(6);
      expect(config.paused).to.equal(false);
      expect(config.enableTransferHook).to.equal(false);
      expect(config.enablePermanentDelegate).to.equal(false);
      expect(config.defaultAccountFrozen).to.equal(false);
    });
  });

  // ============================================================
  // 2. Role Management
  // ============================================================

  describe("update_roles", () => {
    it("assigns Minter role (type 0)", async () => {
      const role = rolePda(configPda, 0, minter.publicKey);
      await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(0);
      expect(data.assignee.toString()).to.equal(minter.publicKey.toString());
    });

    it("assigns Burner role (type 1)", async () => {
      const role = rolePda(configPda, 1, burner.publicKey);
      await program.methods
        .updateRoles(1, burner.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(1);
    });

    it("assigns Pauser role (type 2)", async () => {
      const role = rolePda(configPda, 2, pauser.publicKey);
      await program.methods
        .updateRoles(2, pauser.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(2);
    });

    it("assigns Freezer role (type 3)", async () => {
      const role = rolePda(configPda, 3, freezer.publicKey);
      await program.methods
        .updateRoles(3, freezer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(3);
    });

    it("assigns Blacklister role (type 4)", async () => {
      const role = rolePda(configPda, 4, blacklister.publicKey);
      await program.methods
        .updateRoles(4, blacklister.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(4);
    });

    it("assigns Seizer role (type 5)", async () => {
      const role = rolePda(configPda, 5, seizer.publicKey);
      await program.methods
        .updateRoles(5, seizer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(5);
    });

    it("rejects role update from non-authority", async () => {
      const role = rolePda(configPda, 0, recipient.publicKey);
      try {
        await program.methods
          .updateRoles(0, recipient.publicKey, true)
          .accountsStrict({
            authority: minter.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("deactivates and reactivates a role", async () => {
      const role = rolePda(configPda, 0, minter.publicKey);
      // Deactivate
      await program.methods
        .updateRoles(0, minter.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      let data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(false);

      // Reactivate
      await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
    });
  });

  // ============================================================
  // 3. Minter Quota
  // ============================================================

  describe("update_minter_quota", () => {
    it("sets minter quota", async () => {
      const role = rolePda(configPda, 0, minter.publicKey);
      await program.methods
        .updateMinterQuota(new anchor.BN(1_000_000_000))
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          minterRole: role,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.minterQuota.toNumber()).to.equal(1_000_000_000);
    });

    it("rejects quota update from non-authority", async () => {
      const role = rolePda(configPda, 0, minter.publicKey);
      try {
        await program.methods
          .updateMinterQuota(new anchor.BN(999))
          .accountsStrict({
            authority: minter.publicKey,
            config: configPda,
            minterRole: role,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ============================================================
  // 4. Mint Tokens
  // ============================================================

  describe("mint_tokens", () => {
    let recipientAta: PublicKey;

    before(async () => {
      recipientAta = await createAta(recipient.publicKey);
    });

    it("mints tokens successfully", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      const sig = await program.methods
        .mintTokens(new anchor.BN(500_000))
        .accountsStrict({
          minter: minter.publicKey,
          config: configPda,
          minterRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.equal(500_000);
    });

    it("tracks minted_amount cumulatively", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      await program.methods
        .mintTokens(new anchor.BN(300_000))
        .accountsStrict({
          minter: minter.publicKey,
          config: configPda,
          minterRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const role = await program.account.roleAssignment.fetch(minterRole);
      expect(role.mintedAmount.toNumber()).to.equal(800_000);
    });

    it("rejects mint exceeding quota", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      try {
        await program.methods
          .mintTokens(new anchor.BN(1_000_000_000)) // way over quota
          .accountsStrict({
            minter: minter.publicKey,
            config: configPda,
            minterRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("MinterQuotaExceeded");
      }
    });

    it("rejects mint when paused", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      // Pause
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const minterRole = rolePda(configPda, 0, minter.publicKey);
      try {
        await program.methods
          .mintTokens(new anchor.BN(1_000))
          .accountsStrict({
            minter: minter.publicKey,
            config: configPda,
            minterRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenPaused");
      }

      // Unpause for subsequent tests
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();
    });
  });

  // ============================================================
  // 5. Burn Tokens
  // ============================================================

  describe("burn_tokens", () => {
    it("burns tokens successfully", async () => {
      const burnerRole = rolePda(configPda, 1, burner.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const beforeAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(beforeAccount.amount);

      const burnSig = await program.methods
        .burnTokens(new anchor.BN(100_000))
        .accountsStrict({
          burner: burner.publicKey,
          config: configPda,
          burnerRole,
          mint: mint.publicKey,
          from: recipientAta,
          fromAuthority: recipient.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burner, recipient])
        .rpc();
      await provider.connection.confirmTransaction(burnSig, "confirmed");

      const afterAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterAccount.amount)).to.equal(beforeAmount - 100_000);
    });

    it("rejects burn when paused", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const burnerRole = rolePda(configPda, 1, burner.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .burnTokens(new anchor.BN(1_000))
          .accountsStrict({
            burner: burner.publicKey,
            config: configPda,
            burnerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromAuthority: recipient.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burner, recipient])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenPaused");
      }

      // Unpause
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();
    });
  });

  // ============================================================
  // 6. Freeze / Thaw
  // ============================================================

  describe("freeze_account / thaw_account", () => {
    it("freezes an account", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const freezeSig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(freezeSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.equal(true);
    });

    it("rejects freezing already frozen account", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("AccountAlreadyFrozen");
      }
    });

    it("thaws a frozen account", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const thawSig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(thawSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.equal(false);
    });

    it("rejects thawing non-frozen account", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: freezer.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("AccountNotFrozen");
      }
    });
  });

  // ============================================================
  // 7. Pause / Unpause
  // ============================================================

  describe("pause / unpause", () => {
    it("pauses the token", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(true);
    });

    it("rejects pause when already paused", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: pauser.publicKey,
            config: configPda,
            pauserRole,
          })
          .signers([pauser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // Already paused — should get TokenPaused or a similar error
        // The pause instruction itself likely checks if already paused
        expect(e.error).to.exist;
      }
    });

    it("rejects pause from wrong role", async () => {
      // Minter trying to pause
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: minter.publicKey,
            config: configPda,
            pauserRole: minterRole,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA constraint mismatch or role type mismatch
        expect(e).to.exist;
      }
    });

    it("unpauses the token", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser.publicKey,
          config: configPda,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(false);
    });

    it("rejects unpause when not paused", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
      try {
        await program.methods
          .unpause()
          .accountsStrict({
            pauser: pauser.publicKey,
            config: configPda,
            pauserRole,
          })
          .signers([pauser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenNotPaused");
      }
    });
  });

  // ============================================================
  // 8. Authority Transfer (2-step)
  // ============================================================

  describe("transfer_authority / accept / cancel", () => {
    const newAuthority = Keypair.generate();

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        newAuthority.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    });

    it("initiates authority transfer", async () => {
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toString()).to.equal(
        newAuthority.publicKey.toString()
      );
    });

    it("rejects duplicate transfer initiation (already pending)", async () => {
      try {
        await program.methods
          .transferAuthority(newAuthority.publicKey)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal(
          "AuthorityTransferAlreadyPending"
        );
      }
    });

    it("rejects accept from wrong signer", async () => {
      try {
        await program.methods
          .acceptAuthority()
          .accountsStrict({
            newAuthority: minter.publicKey, // wrong signer
            config: configPda,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidPendingAuthority");
      }
    });

    it("cancels authority transfer", async () => {
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );
    });

    it("rejects cancel when no transfer pending", async () => {
      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("AuthorityTransferNotPending");
      }
    });

    it("accepts authority transfer (full flow)", async () => {
      // Re-initiate
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      // Accept
      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: newAuthority.publicKey,
          config: configPda,
        })
        .signers([newAuthority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(
        newAuthority.publicKey.toString()
      );
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );

      // Transfer back for remaining tests
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsStrict({
          authority: newAuthority.publicKey,
          config: configPda,
        })
        .signers([newAuthority])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const restored = await program.account.stablecoinConfig.fetch(configPda);
      expect(restored.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
    });
  });

  // ============================================================
  // 9. SSS-2 Blacklist — fails on SSS-1
  // ============================================================

  describe("add_to_blacklist / remove_from_blacklist (SSS-2 on SSS-1)", () => {
    it("rejects addToBlacklist on SSS-1 token (ComplianceNotEnabled)", async () => {
      const blacklisterRole = rolePda(configPda, 4, blacklister.publicKey);
      const [blacklistEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          mint.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
        ],
        hookProgram.programId
      );

      try {
        await program.methods
          .addToBlacklist(recipient.publicKey, "test")
          .accountsStrict({
            blacklister: blacklister.publicKey,
            config: configPda,
            blacklisterRole,
            hookProgram: hookProgram.programId,
            blacklistEntry,
            mint: mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([blacklister])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("ComplianceNotEnabled");
      }
    });
  });

  // ============================================================
  // 10. Seize — fails on SSS-1
  // ============================================================

  describe("seize (SSS-2 on SSS-1)", () => {
    it("rejects seize on SSS-1 token (PermanentDelegateNotEnabled)", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Create authority ATA for the destination
      let authorityAta: PublicKey;
      try {
        authorityAta = await createAta(authority.publicKey);
      } catch {
        // Already exists
        authorityAta = getAssociatedTokenAddressSync(
          mint.publicKey,
          authority.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
      }

      // Assign Seizer role (type 5) so the PDA exists — seize will still fail with PermanentDelegateNotEnabled
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

      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            seizerRole,
            mint: mint.publicKey,
            from: recipientAta,
            to: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("PermanentDelegateNotEnabled");
      }
    });
  });
});
