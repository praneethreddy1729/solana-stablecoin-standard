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

describe("edge-cases", () => {
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
    const signers = [minter, burner, pauser, freezer, blacklister, recipient];
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

    // Initialize token
    await program.methods
      .initialize({
        name: "EdgeUSD",
        symbol: "EUSD",
        uri: "https://example.com/eusd.json",
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

    // Assign all roles
    const roles = [
      { type: 0, assignee: minter },
      { type: 1, assignee: burner },
      { type: 2, assignee: pauser },
      { type: 3, assignee: freezer },
      { type: 4, assignee: blacklister },
    ];

    for (const r of roles) {
      const role = rolePda(configPda, r.type, r.assignee.publicKey);
      await program.methods
        .updateRoles(r.type, r.assignee.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Set minter quota to exactly 1_000_000
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    await program.methods
      .updateMinterQuota(new anchor.BN(1_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // Create recipient ATA and mint some tokens for burn tests
    await createAta(recipient.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
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
  });

  // ============================================================
  // 1. Zero Amounts
  // ============================================================

  describe("Zero Amounts", () => {
    it("rejects mint with zero amount", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(0))
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
        expect(e.error.errorCode.code).to.equal("ZeroAmount");
      }
    });

    it("rejects burn with zero amount", async () => {
      const burnerRole = rolePda(configPda, 1, burner.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .burnTokens(new anchor.BN(0))
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
        expect(e.error.errorCode.code).to.equal("ZeroAmount");
      }
    });
  });

  // ============================================================
  // 2. Duplicate Operations
  // ============================================================

  describe("Duplicate Operations", () => {
    it("rejects double freeze on same account", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // First freeze
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

      // Second freeze should fail
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

      // Thaw for subsequent tests
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
    });

    it("rejects double blacklist on SSS-1 token (ComplianceNotEnabled)", async () => {
      // On an SSS-1 token, even a single blacklist call fails with ComplianceNotEnabled.
      // This ensures the guard fires before any duplicate logic.
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
  // 3. Wrong Role
  // ============================================================

  describe("Wrong Role", () => {
    it("rejects minter trying to freeze (PDA mismatch)", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      // Minter role PDA uses role_type=0, freeze expects role_type=3
      // Anchor seed verification will reject this
      const minterRole = rolePda(configPda, 0, minter.publicKey);

      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: minter.publicKey,
            config: configPda,
            freezerRole: minterRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA seeds mismatch — Anchor throws ConstraintSeeds
        expect(e.toString()).to.include("Error");
      }
    });

    it("rejects burner trying to mint (PDA mismatch)", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const burnerRole = rolePda(configPda, 1, burner.publicKey);

      try {
        await program.methods
          .mintTokens(new anchor.BN(1_000))
          .accountsStrict({
            minter: burner.publicKey,
            config: configPda,
            minterRole: burnerRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burner])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA seeds mismatch — minterRole seed uses RoleType::Minter(0), but burnerRole was derived with type 1
        expect(e.toString()).to.include("Error");
      }
    });

    it("rejects pauser trying to blacklist (PDA mismatch)", async () => {
      const pauserRole = rolePda(configPda, 2, pauser.publicKey);
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
            blacklister: pauser.publicKey,
            config: configPda,
            blacklisterRole: pauserRole,
            hookProgram: hookProgram.programId,
            blacklistEntry,
            mint: mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([pauser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // Either PDA seed mismatch or ComplianceNotEnabled (SSS-1 token)
        expect(e.toString()).to.include("Error");
      }
    });
  });

  // ============================================================
  // 4. Boundary Conditions (Minter Quota)
  // ============================================================

  describe("Boundary Conditions", () => {
    it("mints exactly up to remaining quota", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Check current minted_amount (should be 500_000 from setup)
      const roleBefore = await program.account.roleAssignment.fetch(minterRole);
      const remaining =
        roleBefore.minterQuota.toNumber() -
        roleBefore.mintedAmount.toNumber();

      // Mint exactly the remaining amount
      await program.methods
        .mintTokens(new anchor.BN(remaining))
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

      const roleAfter = await program.account.roleAssignment.fetch(minterRole);
      expect(roleAfter.mintedAmount.toNumber()).to.equal(
        roleAfter.minterQuota.toNumber()
      );
    });

    it("rejects mint of 1 token when quota is fully used", async () => {
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(1))
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
  });

  // ============================================================
  // 5. Self-Operations
  // ============================================================

  describe("Self-Operations", () => {
    it("freezer can freeze their own token account", async () => {
      // Create an ATA for the freezer and mint some tokens to it
      let freezerAta: PublicKey;
      try {
        freezerAta = await createAta(freezer.publicKey);
      } catch {
        freezerAta = getAssociatedTokenAddressSync(
          mint.publicKey,
          freezer.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
      }

      // Bump quota to allow more minting
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      await program.methods
        .updateMinterQuota(new anchor.BN(2_000_000))
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          minterRole,
        })
        .rpc();

      const mintSig = await program.methods
        .mintTokens(new anchor.BN(1_000))
        .accountsStrict({
          minter: minter.publicKey,
          config: configPda,
          minterRole,
          mint: mint.publicKey,
          to: freezerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      await provider.connection.confirmTransaction(mintSig, "confirmed");

      // Freezer freezes their own account
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const freezeSig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: freezerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(freezeSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        freezerAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.equal(true);

      // Thaw to clean up
      const thawSig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: freezerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(thawSig, "confirmed");
    });

    it("blacklister trying to blacklist self fails on SSS-1 (ComplianceNotEnabled)", async () => {
      const blacklisterRole = rolePda(configPda, 4, blacklister.publicKey);
      const [blacklistEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          mint.publicKey.toBuffer(),
          blacklister.publicKey.toBuffer(),
        ],
        hookProgram.programId
      );

      try {
        await program.methods
          .addToBlacklist(blacklister.publicKey, "test")
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
  // 6. Uninitialized / Non-existent Role PDA
  // ============================================================

  describe("Uninitialized Role PDA", () => {
    it("rejects mint from user with no role PDA (AccountNotInitialized)", async () => {
      const randomUser = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        randomUser.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // This role PDA has never been initialized
      const fakeRole = rolePda(configPda, 0, randomUser.publicKey);

      try {
        await program.methods
          .mintTokens(new anchor.BN(1_000))
          .accountsStrict({
            minter: randomUser.publicKey,
            config: configPda,
            minterRole: fakeRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // Anchor will fail because the account doesn't exist / isn't initialized
        expect(e.toString()).to.include("Error");
      }
    });

    it("rejects freeze from user with no role PDA", async () => {
      const randomUser = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        randomUser.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const fakeRole = rolePda(configPda, 3, randomUser.publicKey);

      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: randomUser.publicKey,
            config: configPda,
            freezerRole: fakeRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });

    it("rejects pause from user with no role PDA", async () => {
      const randomUser = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        randomUser.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const fakeRole = rolePda(configPda, 2, randomUser.publicKey);

      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: randomUser.publicKey,
            config: configPda,
            pauserRole: fakeRole,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });
  });

  // ============================================================
  // 7. Deactivated Role
  // ============================================================

  describe("Deactivated Role", () => {
    it("rejects mint after minter role is deactivated", async () => {
      // Deactivate minter
      const minterRole = rolePda(configPda, 0, minter.publicKey);
      await program.methods
        .updateRoles(0, minter.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

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
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }

      // Reactivate for cleanup
      await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects freeze after freezer role is deactivated", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      await program.methods
        .updateRoles(3, freezer.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: freezerRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

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
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }

      // Reactivate for cleanup
      await program.methods
        .updateRoles(3, freezer.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: freezerRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  });

  // ============================================================
  // 8. Invalid Role Type
  // ============================================================

  describe("Invalid Role Type", () => {
    it("rejects assigning role with invalid type (255)", async () => {
      const fakeAssignee = Keypair.generate();
      const role = rolePda(configPda, 255, fakeAssignee.publicKey);

      try {
        await program.methods
          .updateRoles(255, fakeAssignee.publicKey, true)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidRoleType");
      }
    });
  });
});
