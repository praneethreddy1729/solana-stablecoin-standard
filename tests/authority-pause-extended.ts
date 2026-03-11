import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
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
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("authority-pause-extended", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet.payer!;

  // ── Shared helpers ──

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

  function configPda(mintKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintKey.toBuffer()],
      program.programId
    );
    return pda;
  }

  async function fund(kp: Keypair, sol = 2) {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports: sol * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);
  }

  async function initMint(
    mint: Keypair
  ): Promise<{ config: PublicKey; mint: PublicKey }> {
    const config = configPda(mint.publicKey);
    await program.methods
      .initialize({
        name: "TestUSD",
        symbol: "TUSD",
        uri: "",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: PublicKey.default,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config,
        mint: mint.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mint.publicKey.toBuffer()], program.programId)[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();
    return { config, mint: mint.publicKey };
  }

  async function assignRole(
    cfg: PublicKey,
    roleType: number,
    assignee: PublicKey
  ) {
    const role = rolePda(cfg, roleType, assignee);
    await program.methods
      .updateRoles(roleType, assignee, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: cfg,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return role;
  }

  async function setMinterQuota(
    cfg: PublicKey,
    minterPub: PublicKey,
    quota: number
  ) {
    const minterRole = rolePda(cfg, 0, minterPub);
    await program.methods
      .updateMinter(new anchor.BN(quota))
      .accountsStrict({
        authority: authority.publicKey,
        config: cfg,
        minterRole,
      })
      .rpc();
  }

  async function createAta(
    mintKey: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mintKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      ata,
      owner,
      mintKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx);
    return ata;
  }

  // ============================================================
  // Group 1: Basic authority transfer flow (shared mint)
  // ============================================================

  describe("Group 1: Basic authority transfer flow", () => {
    const mint1 = Keypair.generate();
    let cfg1: PublicKey;
    const newAuth = Keypair.generate();
    const randomSigner = Keypair.generate();

    before(async () => {
      await fund(newAuth);
      await fund(randomSigner);
      const result = await initMint(mint1);
      cfg1 = result.config;
    });

    it("1. Initiate authority transfer sets pending_authority", async () => {
      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg1,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg1);
      expect(config.pendingAuthority.toString()).to.equal(
        newAuth.publicKey.toString()
      );
      expect(config.transferInitiatedAt.toNumber()).to.be.greaterThan(0);
    });

    it("2. Only current authority can initiate transfer (non-authority fails)", async () => {
      // Cancel the pending transfer first so we can test fresh
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg1,
        })
        .rpc();

      try {
        await program.methods
          .transferAuthority(randomSigner.publicKey)
          .accountsStrict({
            authority: newAuth.publicKey,
            config: cfg1,
          })
          .signers([newAuth])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("3. Random signer cannot initiate transfer", async () => {
      try {
        await program.methods
          .transferAuthority(randomSigner.publicKey)
          .accountsStrict({
            authority: randomSigner.publicKey,
            config: cfg1,
          })
          .signers([randomSigner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("4. Cannot initiate when transfer already pending (AuthorityTransferAlreadyPending)", async () => {
      // Initiate a transfer
      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg1,
        })
        .rpc();

      // Try to initiate another
      try {
        await program.methods
          .transferAuthority(randomSigner.publicKey)
          .accountsStrict({
            authority: authority.publicKey,
            config: cfg1,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal(
          "AuthorityTransferAlreadyPending"
        );
      }

      // Clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg1,
        })
        .rpc();
    });
  });

  // ============================================================
  // Group 2: Accept flow (new mint)
  // ============================================================

  describe("Group 2: Accept flow", () => {
    const mint2 = Keypair.generate();
    let cfg2: PublicKey;
    const newAuth2 = Keypair.generate();
    const randomSigner2 = Keypair.generate();
    const testAssignee = Keypair.generate();

    before(async () => {
      await fund(newAuth2);
      await fund(randomSigner2);
      await fund(testAssignee);
      const result = await initMint(mint2);
      cfg2 = result.config;

      // Initiate transfer
      await program.methods
        .transferAuthority(newAuth2.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg2,
        })
        .rpc();
    });

    it("5. Pending authority can accept", async () => {
      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: newAuth2.publicKey,
          config: cfg2,
        })
        .signers([newAuth2])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg2);
      expect(config.authority.toString()).to.equal(
        newAuth2.publicKey.toString()
      );
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );
    });

    it("6. Current authority cannot accept (they are not the pending one)", async () => {
      // newAuth2 is now authority; transfer to randomSigner2
      await program.methods
        .transferAuthority(randomSigner2.publicKey)
        .accountsStrict({
          authority: newAuth2.publicKey,
          config: cfg2,
        })
        .signers([newAuth2])
        .rpc();

      // newAuth2 (current authority) tries to accept — should fail
      try {
        await program.methods
          .acceptAuthority()
          .accountsStrict({
            newAuthority: newAuth2.publicKey,
            config: cfg2,
          })
          .signers([newAuth2])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidPendingAuthority");
      }

      // Cancel to clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: newAuth2.publicKey,
          config: cfg2,
        })
        .signers([newAuth2])
        .rpc();
    });

    it("7. Random signer cannot accept", async () => {
      // Transfer to testAssignee
      await program.methods
        .transferAuthority(testAssignee.publicKey)
        .accountsStrict({
          authority: newAuth2.publicKey,
          config: cfg2,
        })
        .signers([newAuth2])
        .rpc();

      try {
        await program.methods
          .acceptAuthority()
          .accountsStrict({
            newAuthority: randomSigner2.publicKey,
            config: cfg2,
          })
          .signers([randomSigner2])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidPendingAuthority");
      }

      // Cancel
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: newAuth2.publicKey,
          config: cfg2,
        })
        .signers([newAuth2])
        .rpc();
    });

    it("8. After acceptance, new authority can assign roles", async () => {
      // newAuth2 is already authority from test 5
      const role = rolePda(cfg2, 0, testAssignee.publicKey);
      await program.methods
        .updateRoles(0, testAssignee.publicKey, true)
        .accountsStrict({
          authority: newAuth2.publicKey,
          config: cfg2,
          role,
          systemProgram: SystemProgram.programId,
        })
        .signers([newAuth2])
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
    });

    it("9. After acceptance, old authority cannot assign roles", async () => {
      const another = Keypair.generate();
      await fund(another);
      const role = rolePda(cfg2, 1, another.publicKey);

      try {
        await program.methods
          .updateRoles(1, another.publicKey, true)
          .accountsStrict({
            authority: authority.publicKey, // old authority
            config: cfg2,
            role,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ============================================================
  // Group 3: Cancel flow (new mint)
  // ============================================================

  describe("Group 3: Cancel flow", () => {
    const mint3 = Keypair.generate();
    let cfg3: PublicKey;
    const pendingAuth3 = Keypair.generate();
    const anotherAuth3 = Keypair.generate();

    before(async () => {
      await fund(pendingAuth3);
      await fund(anotherAuth3);
      const result = await initMint(mint3);
      cfg3 = result.config;
    });

    it("10. Current authority can cancel pending transfer", async () => {
      await program.methods
        .transferAuthority(pendingAuth3.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg3);
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );
    });

    it("11. Pending authority cannot cancel (only current can)", async () => {
      // Initiate
      await program.methods
        .transferAuthority(pendingAuth3.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsStrict({
            authority: pendingAuth3.publicKey,
            config: cfg3,
          })
          .signers([pendingAuth3])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }

      // Clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();
    });

    it("12. After cancel, pending_authority is reset", async () => {
      await program.methods
        .transferAuthority(pendingAuth3.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg3);
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );
      expect(config.transferInitiatedAt.toNumber()).to.equal(0);
    });

    it("13. Can initiate new transfer after cancel", async () => {
      // Should succeed since pending is cleared
      await program.methods
        .transferAuthority(anotherAuth3.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg3);
      expect(config.pendingAuthority.toString()).to.equal(
        anotherAuth3.publicKey.toString()
      );

      // Clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg3,
        })
        .rpc();
    });
  });

  // ============================================================
  // Group 4: Edge cases (new mint each)
  // ============================================================

  describe("Group 4: Authority transfer edge cases", () => {
    it("14. Transfer authority to self succeeds", async () => {
      const mint4 = Keypair.generate();
      const result = await initMint(mint4);
      const cfg = result.config;

      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg);
      expect(config.pendingAuthority.toString()).to.equal(
        authority.publicKey.toString()
      );

      // Accept self-transfer
      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authority.publicKey,
          config: cfg,
        })
        .rpc();

      const configAfter = await program.account.stablecoinConfig.fetch(cfg);
      expect(configAfter.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(configAfter.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );
    });

    it("15. Accept authority then transfer again to someone else", async () => {
      const mint5 = Keypair.generate();
      const firstAuth = Keypair.generate();
      const secondAuth = Keypair.generate();
      await fund(firstAuth);
      await fund(secondAuth);

      const result = await initMint(mint5);
      const cfg = result.config;

      // Transfer to firstAuth
      await program.methods
        .transferAuthority(firstAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg,
        })
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: firstAuth.publicKey,
          config: cfg,
        })
        .signers([firstAuth])
        .rpc();

      // Now firstAuth transfers to secondAuth
      await program.methods
        .transferAuthority(secondAuth.publicKey)
        .accountsStrict({
          authority: firstAuth.publicKey,
          config: cfg,
        })
        .signers([firstAuth])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: secondAuth.publicKey,
          config: cfg,
        })
        .signers([secondAuth])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg);
      expect(config.authority.toString()).to.equal(
        secondAuth.publicKey.toString()
      );
    });

    it("16. New authority can transfer to yet another authority (chain of transfers)", async () => {
      const mint6 = Keypair.generate();
      const authA = Keypair.generate();
      const authB = Keypair.generate();
      const authC = Keypair.generate();
      await fund(authA);
      await fund(authB);
      await fund(authC);

      const result = await initMint(mint6);
      const cfg = result.config;

      // authority -> authA
      await program.methods
        .transferAuthority(authA.publicKey)
        .accountsStrict({ authority: authority.publicKey, config: cfg })
        .rpc();
      await program.methods
        .acceptAuthority()
        .accountsStrict({ newAuthority: authA.publicKey, config: cfg })
        .signers([authA])
        .rpc();

      // authA -> authB
      await program.methods
        .transferAuthority(authB.publicKey)
        .accountsStrict({ authority: authA.publicKey, config: cfg })
        .signers([authA])
        .rpc();
      await program.methods
        .acceptAuthority()
        .accountsStrict({ newAuthority: authB.publicKey, config: cfg })
        .signers([authB])
        .rpc();

      // authB -> authC
      await program.methods
        .transferAuthority(authC.publicKey)
        .accountsStrict({ authority: authB.publicKey, config: cfg })
        .signers([authB])
        .rpc();
      await program.methods
        .acceptAuthority()
        .accountsStrict({ newAuthority: authC.publicKey, config: cfg })
        .signers([authC])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg);
      expect(config.authority.toString()).to.equal(
        authC.publicKey.toString()
      );
    });
  });

  // ============================================================
  // Group 5: Pause blocks correct ops (shared mint)
  // ============================================================

  describe("Group 5: Pause interaction matrix", () => {
    const mint5 = Keypair.generate();
    let cfg5: PublicKey;
    const minter5 = Keypair.generate();
    const burner5 = Keypair.generate();
    const pauser5 = Keypair.generate();
    const freezer5 = Keypair.generate();
    const recipient5 = Keypair.generate();
    const newAuth5 = Keypair.generate();
    let recipientAta5: PublicKey;

    before(async () => {
      await fund(minter5);
      await fund(burner5);
      await fund(pauser5);
      await fund(freezer5);
      await fund(recipient5);
      await fund(newAuth5);

      const result = await initMint(mint5);
      cfg5 = result.config;

      // Assign roles
      await assignRole(cfg5, 0, minter5.publicKey);
      await assignRole(cfg5, 1, burner5.publicKey);
      await assignRole(cfg5, 2, pauser5.publicKey);
      await assignRole(cfg5, 3, freezer5.publicKey);

      // Set minter quota
      await setMinterQuota(cfg5, minter5.publicKey, 10_000_000);

      // Create recipient ATA and mint tokens for burn tests
      recipientAta5 = await createAta(mint5.publicKey, recipient5.publicKey);
      const minterRole5 = rolePda(cfg5, 0, minter5.publicKey);
      await program.methods
        .mint(new anchor.BN(1_000_000))
        .accountsStrict({
          minter: minter5.publicKey,
          config: cfg5,
          minterRole: minterRole5,
          mint: mint5.publicKey,
          to: recipientAta5,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter5])
        .rpc();

      // Pause
      const pauserRole5 = rolePda(cfg5, 2, pauser5.publicKey);
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauser5.publicKey,
          config: cfg5,
          pauserRole: pauserRole5,
        })
        .signers([pauser5])
        .rpc();
    });

    it("17. Pause -> mint fails with TokenPaused", async () => {
      const minterRole = rolePda(cfg5, 0, minter5.publicKey);
      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: minter5.publicKey,
            config: cfg5,
            minterRole,
            mint: mint5.publicKey,
            to: recipientAta5,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter5])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenPaused");
      }
    });

    it("18. Pause -> burn fails with TokenPaused", async () => {
      const burnerRole = rolePda(cfg5, 1, burner5.publicKey);
      try {
        await program.methods
          .burn(new anchor.BN(1_000))
          .accountsStrict({
            burner: burner5.publicKey,
            config: cfg5,
            burnerRole,
            mint: mint5.publicKey,
            from: recipientAta5,
            fromAuthority: recipient5.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burner5, recipient5])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenPaused");
      }
    });

    it("19. Pause -> freeze SUCCEEDS (not blocked by pause)", async () => {
      const freezerRole = rolePda(cfg5, 3, freezer5.publicKey);
      const sig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: freezer5.publicKey,
          config: cfg5,
          freezerRole,
          mint: mint5.publicKey,
          tokenAccount: recipientAta5,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer5])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta5,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.equal(true);
    });

    it("20. Pause -> thaw SUCCEEDS (not blocked by pause)", async () => {
      const freezerRole = rolePda(cfg5, 3, freezer5.publicKey);
      const sig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezer5.publicKey,
          config: cfg5,
          freezerRole,
          mint: mint5.publicKey,
          tokenAccount: recipientAta5,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer5])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta5,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.equal(false);
    });

    it("21. Pause -> updateRoles SUCCEEDS (not blocked by pause)", async () => {
      const newGuy = Keypair.generate();
      await fund(newGuy);
      const role = rolePda(cfg5, 0, newGuy.publicKey);
      await program.methods
        .updateRoles(0, newGuy.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg5,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);

      // Deactivate to clean up
      await program.methods
        .updateRoles(0, newGuy.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg5,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("22. Pause -> updateMinter SUCCEEDS (not blocked by pause)", async () => {
      const minterRole = rolePda(cfg5, 0, minter5.publicKey);
      await program.methods
        .updateMinter(new anchor.BN(20_000_000))
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg5,
          minterRole,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(minterRole);
      expect(data.minterQuota.toNumber()).to.equal(20_000_000);
    });

    it("23. Pause -> transferAuthority SUCCEEDS (not blocked by pause)", async () => {
      await program.methods
        .transferAuthority(newAuth5.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg5,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(cfg5);
      expect(config.pendingAuthority.toString()).to.equal(
        newAuth5.publicKey.toString()
      );

      // Cancel to clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg5,
        })
        .rpc();
    });

    it("24. Unpause -> mint works again", async () => {
      // Unpause
      const pauserRole = rolePda(cfg5, 2, pauser5.publicKey);
      const unpauseSig = await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauser5.publicKey,
          config: cfg5,
          pauserRole,
        })
        .signers([pauser5])
        .rpc();
      await provider.connection.confirmTransaction(unpauseSig, "confirmed");

      const minterRole = rolePda(cfg5, 0, minter5.publicKey);
      const mintSig = await program.methods
        .mint(new anchor.BN(5_000))
        .accountsStrict({
          minter: minter5.publicKey,
          config: cfg5,
          minterRole,
          mint: mint5.publicKey,
          to: recipientAta5,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter5])
        .rpc();
      await provider.connection.confirmTransaction(mintSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta5,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.be.greaterThan(1_000_000);
    });

    it("25. Unpause -> burn works again", async () => {
      const burnerRole = rolePda(cfg5, 1, burner5.publicKey);
      const beforeAccount = await getAccount(
        provider.connection,
        recipientAta5,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(beforeAccount.amount);

      const burnSig = await program.methods
        .burn(new anchor.BN(1_000))
        .accountsStrict({
          burner: burner5.publicKey,
          config: cfg5,
          burnerRole,
          mint: mint5.publicKey,
          from: recipientAta5,
          fromAuthority: recipient5.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burner5, recipient5])
        .rpc();
      await provider.connection.confirmTransaction(burnSig, "confirmed");

      const afterAccount = await getAccount(
        provider.connection,
        recipientAta5,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterAccount.amount)).to.equal(beforeAmount - 1_000);
    });
  });

  // ============================================================
  // Group 6: Pause edge cases
  // ============================================================

  describe("Group 6: Pause edge cases", () => {
    const mint6 = Keypair.generate();
    let cfg6: PublicKey;
    const pauserA = Keypair.generate();
    const pauserB = Keypair.generate();
    const revokedPauser = Keypair.generate();
    const nonPauser = Keypair.generate();

    before(async () => {
      await fund(pauserA);
      await fund(pauserB);
      await fund(revokedPauser);
      await fund(nonPauser);

      const result = await initMint(mint6);
      cfg6 = result.config;

      // Assign pauser roles to A, B, and revokedPauser
      await assignRole(cfg6, 2, pauserA.publicKey);
      await assignRole(cfg6, 2, pauserB.publicKey);
      await assignRole(cfg6, 2, revokedPauser.publicKey);
    });

    it("26. Double pause fails (TokenPaused)", async () => {
      const pauserRoleA = rolePda(cfg6, 2, pauserA.publicKey);

      // First pause
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauserA.publicKey,
          config: cfg6,
          pauserRole: pauserRoleA,
        })
        .signers([pauserA])
        .rpc();

      // Second pause should fail
      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: pauserA.publicKey,
            config: cfg6,
            pauserRole: pauserRoleA,
          })
          .signers([pauserA])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenPaused");
      }

      // Unpause for next test
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauserA.publicKey,
          config: cfg6,
          pauserRole: pauserRoleA,
        })
        .signers([pauserA])
        .rpc();
    });

    it("27. Double unpause fails (TokenNotPaused)", async () => {
      const pauserRoleA = rolePda(cfg6, 2, pauserA.publicKey);

      // Token is already unpaused from previous test cleanup
      try {
        await program.methods
          .unpause()
          .accountsStrict({
            pauser: pauserA.publicKey,
            config: cfg6,
            pauserRole: pauserRoleA,
          })
          .signers([pauserA])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("TokenNotPaused");
      }
    });

    it("28. Pause by pauser A, unpause by pauser B (both have Pauser role)", async () => {
      const pauserRoleA = rolePda(cfg6, 2, pauserA.publicKey);
      const pauserRoleB = rolePda(cfg6, 2, pauserB.publicKey);

      // Pauser A pauses
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauserA.publicKey,
          config: cfg6,
          pauserRole: pauserRoleA,
        })
        .signers([pauserA])
        .rpc();

      const configPaused = await program.account.stablecoinConfig.fetch(cfg6);
      expect(configPaused.paused).to.equal(true);

      // Pauser B unpauses
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauserB.publicKey,
          config: cfg6,
          pauserRole: pauserRoleB,
        })
        .signers([pauserB])
        .rpc();

      const configUnpaused = await program.account.stablecoinConfig.fetch(cfg6);
      expect(configUnpaused.paused).to.equal(false);
    });

    it("29. Revoked pauser cannot pause", async () => {
      // Revoke revokedPauser
      const revokedRole = rolePda(cfg6, 2, revokedPauser.publicKey);
      await program.methods
        .updateRoles(2, revokedPauser.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: cfg6,
          role: revokedRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: revokedPauser.publicKey,
            config: cfg6,
            pauserRole: revokedRole,
          })
          .signers([revokedPauser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }
    });

    it("30. Non-pauser cannot unpause", async () => {
      // First pause so we can test unpause rejection
      const pauserRoleA = rolePda(cfg6, 2, pauserA.publicKey);
      await program.methods
        .pause()
        .accountsStrict({
          pauser: pauserA.publicKey,
          config: cfg6,
          pauserRole: pauserRoleA,
        })
        .signers([pauserA])
        .rpc();

      // nonPauser has no role PDA — the account won't exist
      const fakeRole = rolePda(cfg6, 2, nonPauser.publicKey);
      try {
        await program.methods
          .unpause()
          .accountsStrict({
            pauser: nonPauser.publicKey,
            config: cfg6,
            pauserRole: fakeRole,
          })
          .signers([nonPauser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA account doesn't exist / AccountNotInitialized
        expect(e.toString()).to.include("Error");
      }

      // Unpause for cleanup
      await program.methods
        .unpause()
        .accountsStrict({
          pauser: pauserA.publicKey,
          config: cfg6,
          pauserRole: pauserRoleA,
        })
        .signers([pauserA])
        .rpc();
    });
  });
});
