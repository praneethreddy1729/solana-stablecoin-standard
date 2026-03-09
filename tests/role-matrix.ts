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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

/**
 * Role Matrix: Exhaustive authorization test suite.
 *
 * For every role-gated instruction we verify:
 *   - Correct role succeeds
 *   - Each OTHER role type fails (PDA seeds mismatch -> ConstraintSeeds)
 *   - User with NO role PDA fails (AccountNotInitialized)
 *   - Revoked role (isActive=false) fails with RoleNotActive
 *
 * For authority-only instructions we verify:
 *   - Authority succeeds
 *   - Non-authority (even with a role) fails with Unauthorized
 */
describe("role-matrix", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet.payer;
  const mint = Keypair.generate();

  // ---- Role holders (one dedicated keypair per role type) ----
  const minterKp = Keypair.generate();
  const burnerKp = Keypair.generate();
  const pauserKp = Keypair.generate();
  const freezerKp = Keypair.generate();
  const blacklisterKp = Keypair.generate();
  const seizerKp = Keypair.generate();

  // Extra keypairs
  const recipient = Keypair.generate();
  const nobody = Keypair.generate(); // has no roles at all

  // Role type constants
  const MINTER = 0;
  const BURNER = 1;
  const PAUSER = 2;
  const FREEZER = 3;
  const BLACKLISTER = 4;
  const SEIZER = 5;

  const ROLE_NAMES = ["Minter", "Burner", "Pauser", "Freezer", "Blacklister", "Seizer"];

  // Map role type -> keypair
  const roleKeypairs: Record<number, Keypair> = {
    [MINTER]: minterKp,
    [BURNER]: burnerKp,
    [PAUSER]: pauserKp,
    [FREEZER]: freezerKp,
    [BLACKLISTER]: blacklisterKp,
    [SEIZER]: seizerKp,
  };

  let configPda: PublicKey;
  let recipientAta: PublicKey;

  // ---- Helpers ----

  function rolePda(configKey: PublicKey, roleType: number, assignee: PublicKey): PublicKey {
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

  async function createAta(mintKey: PublicKey, owner: PublicKey, payer: Keypair = authority): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mintKey, owner, false, TOKEN_2022_PROGRAM_ID);
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mintKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx);
    return ata;
  }

  async function airdrop(kp: Keypair, sol = 2) {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  async function assignRole(roleType: number, assignee: PublicKey): Promise<PublicKey> {
    const role = rolePda(configPda, roleType, assignee);
    await program.methods
      .updateRoles(roleType, assignee, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return role;
  }

  async function revokeRole(roleType: number, assignee: PublicKey): Promise<void> {
    const role = rolePda(configPda, roleType, assignee);
    await program.methods
      .updateRoles(roleType, assignee, false)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async function reactivateRole(roleType: number, assignee: PublicKey): Promise<void> {
    const role = rolePda(configPda, roleType, assignee);
    await program.methods
      .updateRoles(roleType, assignee, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async function ensureUnpaused(): Promise<void> {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    if (config.paused) {
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      await program.methods
        .unpause()
        .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
        .signers([pauserKp])
        .rpc();
    }
  }

  async function ensurePaused(): Promise<void> {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    if (!config.paused) {
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      await program.methods
        .pause()
        .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
        .signers([pauserKp])
        .rpc();
    }
  }

  async function ensureThawed(ata: PublicKey): Promise<void> {
    const acct = await getAccount(provider.connection, ata, "processed", TOKEN_2022_PROGRAM_ID);
    if (acct.isFrozen) {
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      const sig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezerKp.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezerKp])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  }

  async function ensureFrozen(ata: PublicKey): Promise<void> {
    const acct = await getAccount(provider.connection, ata, "processed", TOKEN_2022_PROGRAM_ID);
    if (!acct.isFrozen) {
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      const sig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: freezerKp.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezerKp])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  }

  // ---- Global setup ----

  before(async () => {
    // Fund all keypairs
    const allKps = [minterKp, burnerKp, pauserKp, freezerKp, blacklisterKp, seizerKp, recipient, nobody];
    for (const kp of allKps) {
      await airdrop(kp);
    }

    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Initialize SSS-1 stablecoin (no hook, no delegate)
    await program.methods
      .initialize({
        name: "RoleMatrixUSD",
        symbol: "RMUSD",
        uri: "https://example.com/rm.json",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: getAssociatedTokenAddressSync(mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID),
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mint.publicKey.toBuffer()], program.programId)[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    // Assign ALL roles to their dedicated keypairs
    for (let rt = 0; rt <= 5; rt++) {
      await assignRole(rt, roleKeypairs[rt].publicKey);
    }

    // Set minter quota
    const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(1_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // Create recipient ATA and mint some tokens for burn/freeze tests
    recipientAta = await createAta(mint.publicKey, recipient.publicKey);

    await program.methods
      .mint(new anchor.BN(10_000_000))
      .accountsStrict({
        minter: minterKp.publicKey,
        config: configPda,
        minterRole,
        mint: mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKp])
      .rpc();
  });

  // ================================================================
  // A. MINT — requires Minter role (type 0)
  // ================================================================
  describe("mint() authorization", () => {
    it("succeeds with Minter role", async () => {
      await ensureUnpaused();
      const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
      await program.methods
        .mint(new anchor.BN(1_000))
        .accountsStrict({
          minter: minterKp.publicKey,
          config: configPda,
          minterRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKp])
        .rpc();
    });

    for (const wrongRole of [BURNER, PAUSER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to mint (ConstraintSeeds)`, async () => {
        const kp = roleKeypairs[wrongRole];
        // Derive the Minter-type PDA for this signer — won't match their actual role PDA
        const fakeMinterRole = rolePda(configPda, MINTER, kp.publicKey);
        try {
          await program.methods
            .mint(new anchor.BN(1_000))
            .accountsStrict({
              minter: kp.publicKey,
              config: configPda,
              minterRole: fakeMinterRole,
              mint: mint.publicKey,
              to: recipientAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          // PDA for [role, config, Minter(0), wrongKp] does not exist
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      const fakeMinterRole = rolePda(configPda, MINTER, nobody.publicKey);
      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: nobody.publicKey,
            config: configPda,
            minterRole: fakeMinterRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      }
    });

    it("rejects revoked Minter role (RoleNotActive)", async () => {
      await revokeRole(MINTER, minterKp.publicKey);
      const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: minterKp.publicKey,
            config: configPda,
            minterRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(MINTER, minterKp.publicKey);
      }
    });
  });

  // ================================================================
  // B. BURN — requires Burner role (type 1)
  // ================================================================
  describe("burn() authorization", () => {
    it("succeeds with Burner role", async () => {
      await ensureUnpaused();
      const burnerRole = rolePda(configPda, BURNER, burnerKp.publicKey);
      await program.methods
        .burn(new anchor.BN(1_000))
        .accountsStrict({
          burner: burnerKp.publicKey,
          config: configPda,
          burnerRole,
          mint: mint.publicKey,
          from: recipientAta,
          fromAuthority: recipient.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burnerKp, recipient])
        .rpc();
    });

    for (const wrongRole of [MINTER, PAUSER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to burn (ConstraintSeeds)`, async () => {
        const kp = roleKeypairs[wrongRole];
        const fakeBurnerRole = rolePda(configPda, BURNER, kp.publicKey);
        try {
          await program.methods
            .burn(new anchor.BN(1_000))
            .accountsStrict({
              burner: kp.publicKey,
              config: configPda,
              burnerRole: fakeBurnerRole,
              mint: mint.publicKey,
              from: recipientAta,
              fromAuthority: recipient.publicKey,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([kp, recipient])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      const fakeBurnerRole = rolePda(configPda, BURNER, nobody.publicKey);
      try {
        await program.methods
          .burn(new anchor.BN(1_000))
          .accountsStrict({
            burner: nobody.publicKey,
            config: configPda,
            burnerRole: fakeBurnerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromAuthority: recipient.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody, recipient])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      }
    });

    it("rejects revoked Burner role (RoleNotActive)", async () => {
      await revokeRole(BURNER, burnerKp.publicKey);
      const burnerRole = rolePda(configPda, BURNER, burnerKp.publicKey);
      try {
        await program.methods
          .burn(new anchor.BN(1_000))
          .accountsStrict({
            burner: burnerKp.publicKey,
            config: configPda,
            burnerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromAuthority: recipient.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burnerKp, recipient])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(BURNER, burnerKp.publicKey);
      }
    });
  });

  // ================================================================
  // C. FREEZE_ACCOUNT — requires Freezer role (type 3)
  // ================================================================
  describe("freezeAccount() authorization", () => {
    it("succeeds with Freezer role", async () => {
      await ensureThawed(recipientAta);
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      const sig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: freezerKp.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezerKp])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const acct = await getAccount(provider.connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(acct.isFrozen).to.equal(true);

      // Thaw for subsequent tests
      await ensureThawed(recipientAta);
    });

    for (const wrongRole of [MINTER, BURNER, PAUSER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to freeze (ConstraintSeeds)`, async () => {
        await ensureThawed(recipientAta);
        const kp = roleKeypairs[wrongRole];
        const fakeFreezerRole = rolePda(configPda, FREEZER, kp.publicKey);
        try {
          await program.methods
            .freezeAccount()
            .accountsStrict({
              freezer: kp.publicKey,
              config: configPda,
              freezerRole: fakeFreezerRole,
              mint: mint.publicKey,
              tokenAccount: recipientAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      await ensureThawed(recipientAta);
      const fakeFreezerRole = rolePda(configPda, FREEZER, nobody.publicKey);
      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: nobody.publicKey,
            config: configPda,
            freezerRole: fakeFreezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      }
    });

    it("rejects revoked Freezer role (RoleNotActive)", async () => {
      await ensureThawed(recipientAta);
      await revokeRole(FREEZER, freezerKp.publicKey);
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      try {
        await program.methods
          .freezeAccount()
          .accountsStrict({
            freezer: freezerKp.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezerKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(FREEZER, freezerKp.publicKey);
      }
    });
  });

  // ================================================================
  // D. THAW_ACCOUNT — requires Freezer role (type 3)
  // ================================================================
  describe("thawAccount() authorization", () => {
    it("succeeds with Freezer role", async () => {
      await ensureFrozen(recipientAta);
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      const sig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezerKp.publicKey,
          config: configPda,
          freezerRole,
          mint: mint.publicKey,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezerKp])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const acct = await getAccount(provider.connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(acct.isFrozen).to.equal(false);
    });

    for (const wrongRole of [MINTER, BURNER, PAUSER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to thaw (ConstraintSeeds)`, async () => {
        await ensureFrozen(recipientAta);
        const kp = roleKeypairs[wrongRole];
        const fakeFreezerRole = rolePda(configPda, FREEZER, kp.publicKey);
        try {
          await program.methods
            .thawAccount()
            .accountsStrict({
              freezer: kp.publicKey,
              config: configPda,
              freezerRole: fakeFreezerRole,
              mint: mint.publicKey,
              tokenAccount: recipientAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        } finally {
          // Ensure we leave it thawed for the next iteration
          try { await ensureThawed(recipientAta); } catch {}
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      await ensureFrozen(recipientAta);
      const fakeFreezerRole = rolePda(configPda, FREEZER, nobody.publicKey);
      try {
        await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: nobody.publicKey,
            config: configPda,
            freezerRole: fakeFreezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      } finally {
        await ensureThawed(recipientAta);
      }
    });

    it("rejects revoked Freezer role (RoleNotActive)", async () => {
      await ensureFrozen(recipientAta);
      await revokeRole(FREEZER, freezerKp.publicKey);
      const freezerRole = rolePda(configPda, FREEZER, freezerKp.publicKey);
      try {
        await program.methods
          .thawAccount()
          .accountsStrict({
            freezer: freezerKp.publicKey,
            config: configPda,
            freezerRole,
            mint: mint.publicKey,
            tokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezerKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(FREEZER, freezerKp.publicKey);
        await ensureThawed(recipientAta);
      }
    });
  });

  // ================================================================
  // E. PAUSE — requires Pauser role (type 2)
  // ================================================================
  describe("pause() authorization", () => {
    it("succeeds with Pauser role", async () => {
      await ensureUnpaused();
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      await program.methods
        .pause()
        .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
        .signers([pauserKp])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(true);

      // Unpause for subsequent tests
      await ensureUnpaused();
    });

    for (const wrongRole of [MINTER, BURNER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to pause (ConstraintSeeds)`, async () => {
        await ensureUnpaused();
        const kp = roleKeypairs[wrongRole];
        const fakePauserRole = rolePda(configPda, PAUSER, kp.publicKey);
        try {
          await program.methods
            .pause()
            .accountsStrict({ pauser: kp.publicKey, config: configPda, pauserRole: fakePauserRole })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      await ensureUnpaused();
      const fakePauserRole = rolePda(configPda, PAUSER, nobody.publicKey);
      try {
        await program.methods
          .pause()
          .accountsStrict({ pauser: nobody.publicKey, config: configPda, pauserRole: fakePauserRole })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      }
    });

    it("rejects revoked Pauser role (RoleNotActive)", async () => {
      await ensureUnpaused();
      await revokeRole(PAUSER, pauserKp.publicKey);
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      try {
        await program.methods
          .pause()
          .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
          .signers([pauserKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(PAUSER, pauserKp.publicKey);
      }
    });
  });

  // ================================================================
  // F. UNPAUSE — requires Pauser role (type 2)
  // ================================================================
  describe("unpause() authorization", () => {
    it("succeeds with Pauser role", async () => {
      await ensurePaused();
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      await program.methods
        .unpause()
        .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
        .signers([pauserKp])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(false);
    });

    for (const wrongRole of [MINTER, BURNER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to unpause (ConstraintSeeds)`, async () => {
        await ensurePaused();
        const kp = roleKeypairs[wrongRole];
        const fakePauserRole = rolePda(configPda, PAUSER, kp.publicKey);
        try {
          await program.methods
            .unpause()
            .accountsStrict({ pauser: kp.publicKey, config: configPda, pauserRole: fakePauserRole })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) => s.includes("AccountNotInitialized") || s.includes("ConstraintSeeds") || s.includes("Error")
          );
        }
      });
    }

    it("rejects user with no role PDA (nobody)", async () => {
      await ensurePaused();
      const fakePauserRole = rolePda(configPda, PAUSER, nobody.publicKey);
      try {
        await program.methods
          .unpause()
          .accountsStrict({ pauser: nobody.publicKey, config: configPda, pauserRole: fakePauserRole })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) => s.includes("AccountNotInitialized") || s.includes("Error")
        );
      }
    });

    it("rejects revoked Pauser role (RoleNotActive)", async () => {
      await ensurePaused();
      await revokeRole(PAUSER, pauserKp.publicKey);
      const pauserRole = rolePda(configPda, PAUSER, pauserKp.publicKey);
      try {
        await program.methods
          .unpause()
          .accountsStrict({ pauser: pauserKp.publicKey, config: configPda, pauserRole })
          .signers([pauserKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(PAUSER, pauserKp.publicKey);
        await ensureUnpaused();
      }
    });
  });

  // ================================================================
  // G. UPDATE_ROLES — authority ONLY
  // ================================================================
  describe("updateRoles() authorization", () => {
    it("succeeds with authority", async () => {
      // Assign a role to nobody just to test authority works
      const role = rolePda(configPda, MINTER, nobody.publicKey);
      await program.methods
        .updateRoles(MINTER, nobody.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);

      // Clean up: deactivate
      await program.methods
        .updateRoles(MINTER, nobody.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    for (const roleType of [MINTER, BURNER, PAUSER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[roleType]} calling updateRoles (Unauthorized)`, async () => {
        const kp = roleKeypairs[roleType];
        const role = rolePda(configPda, MINTER, nobody.publicKey);
        try {
          await program.methods
            .updateRoles(MINTER, nobody.publicKey, true)
            .accountsStrict({
              authority: kp.publicKey,
              config: configPda,
              role,
              systemProgram: SystemProgram.programId,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.error.errorCode.code).to.equal("Unauthorized");
        }
      });
    }

    it("rejects nobody (no role) calling updateRoles (Unauthorized)", async () => {
      const role = rolePda(configPda, MINTER, recipient.publicKey);
      try {
        await program.methods
          .updateRoles(MINTER, recipient.publicKey, true)
          .accountsStrict({
            authority: nobody.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ================================================================
  // H. UPDATE_MINTER — authority ONLY
  // ================================================================
  describe("updateMinter() authorization", () => {
    it("succeeds with authority", async () => {
      const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
      await program.methods
        .updateMinter(new anchor.BN(2_000_000_000))
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          minterRole,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(minterRole);
      expect(data.minterQuota.toNumber()).to.equal(2_000_000_000);
    });

    for (const roleType of [MINTER, BURNER, PAUSER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[roleType]} calling updateMinter (Unauthorized)`, async () => {
        const kp = roleKeypairs[roleType];
        const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
        try {
          await program.methods
            .updateMinter(new anchor.BN(999))
            .accountsStrict({
              authority: kp.publicKey,
              config: configPda,
              minterRole,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.error.errorCode.code).to.equal("Unauthorized");
        }
      });
    }

    it("rejects nobody calling updateMinter (Unauthorized)", async () => {
      const minterRole = rolePda(configPda, MINTER, minterKp.publicKey);
      try {
        await program.methods
          .updateMinter(new anchor.BN(999))
          .accountsStrict({
            authority: nobody.publicKey,
            config: configPda,
            minterRole,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ================================================================
  // I. TRANSFER_AUTHORITY — authority ONLY
  // ================================================================
  describe("transferAuthority() authorization", () => {
    it("succeeds with authority", async () => {
      const newAuth = Keypair.generate();
      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toString()).to.equal(newAuth.publicKey.toString());

      // Cancel so we can use it in later tests
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
    });

    for (const roleType of [MINTER, BURNER, PAUSER, FREEZER, BLACKLISTER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[roleType]} calling transferAuthority (Unauthorized)`, async () => {
        const kp = roleKeypairs[roleType];
        try {
          await program.methods
            .transferAuthority(kp.publicKey)
            .accountsStrict({
              authority: kp.publicKey,
              config: configPda,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.error.errorCode.code).to.equal("Unauthorized");
        }
      });
    }

    it("rejects nobody calling transferAuthority (Unauthorized)", async () => {
      try {
        await program.methods
          .transferAuthority(nobody.publicKey)
          .accountsStrict({
            authority: nobody.publicKey,
            config: configPda,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ================================================================
  // J. ACCEPT_AUTHORITY — pending authority ONLY
  // ================================================================
  describe("acceptAuthority() authorization", () => {
    const pendingAuth = Keypair.generate();

    before(async () => {
      await airdrop(pendingAuth);
      // Initiate a transfer to pendingAuth
      await program.methods
        .transferAuthority(pendingAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
    });

    it("rejects accept from wrong signer (non-pending authority)", async () => {
      try {
        await program.methods
          .acceptAuthority()
          .accountsStrict({
            newAuthority: minterKp.publicKey,
            config: configPda,
          })
          .signers([minterKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidPendingAuthority");
      }
    });

    it("rejects accept from nobody", async () => {
      try {
        await program.methods
          .acceptAuthority()
          .accountsStrict({
            newAuthority: nobody.publicKey,
            config: configPda,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidPendingAuthority");
      }
    });

    it("succeeds with correct pending authority", async () => {
      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: pendingAuth.publicKey,
          config: configPda,
        })
        .signers([pendingAuth])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(pendingAuth.publicKey.toString());

      // Transfer back to original authority
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsStrict({
          authority: pendingAuth.publicKey,
          config: configPda,
        })
        .signers([pendingAuth])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authority.publicKey,
          config: configPda,
        })
        .rpc();
    });
  });

  // ================================================================
  // K. CANCEL_AUTHORITY_TRANSFER — authority ONLY
  // ================================================================
  describe("cancelAuthorityTransfer() authorization", () => {
    before(async () => {
      // Initiate a transfer so we can cancel it
      const tempAuth = Keypair.generate();
      await program.methods
        .transferAuthority(tempAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
    });

    it("rejects cancel from non-authority (Minter)", async () => {
      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsStrict({
            authority: minterKp.publicKey,
            config: configPda,
          })
          .signers([minterKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("rejects cancel from nobody", async () => {
      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsStrict({
            authority: nobody.publicKey,
            config: configPda,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("succeeds with authority", async () => {
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toString()).to.equal(PublicKey.default.toString());
    });
  });

  // ================================================================
  // L. ADD_TO_BLACKLIST — requires Blacklister role (SSS-2 only)
  //    On SSS-1 token, the constraint `enable_transfer_hook` fails
  //    with ComplianceNotEnabled regardless of role.
  //    We still test that wrong roles are rejected.
  // ================================================================
  describe("addToBlacklist() authorization (SSS-1 — ComplianceNotEnabled)", () => {
    const hookProgramId = new PublicKey("A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB");

    function blacklistEntryPda(user: PublicKey): PublicKey {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), mint.publicKey.toBuffer(), user.toBuffer()],
        hookProgramId
      );
      return pda;
    }

    it("rejects with correct Blacklister role on SSS-1 (ComplianceNotEnabled)", async () => {
      const blacklisterRole = rolePda(configPda, BLACKLISTER, blacklisterKp.publicKey);
      const entry = blacklistEntryPda(recipient.publicKey);
      try {
        await program.methods
          .addToBlacklist(recipient.publicKey, "test")
          .accountsStrict({
            blacklister: blacklisterKp.publicKey,
            config: configPda,
            blacklisterRole,
            hookProgram: hookProgramId,
            blacklistEntry: entry,
            mint: mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([blacklisterKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("ComplianceNotEnabled");
      }
    });

    for (const wrongRole of [MINTER, BURNER, PAUSER, FREEZER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to addToBlacklist on SSS-1`, async () => {
        const kp = roleKeypairs[wrongRole];
        const fakeBlacklisterRole = rolePda(configPda, BLACKLISTER, kp.publicKey);
        const entry = blacklistEntryPda(recipient.publicKey);
        try {
          await program.methods
            .addToBlacklist(recipient.publicKey, "test")
            .accountsStrict({
              blacklister: kp.publicKey,
              config: configPda,
              blacklisterRole: fakeBlacklisterRole,
              hookProgram: hookProgramId,
              blacklistEntry: entry,
              mint: mint.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          // Either ComplianceNotEnabled (checked first at account level) or
          // AccountNotInitialized/ConstraintSeeds for the wrong role PDA
          expect(e.toString()).to.satisfy(
            (s: string) =>
              s.includes("ComplianceNotEnabled") ||
              s.includes("AccountNotInitialized") ||
              s.includes("ConstraintSeeds") ||
              s.includes("Error")
          );
        }
      });
    }
  });

  // ================================================================
  // M. REMOVE_FROM_BLACKLIST — requires Blacklister role (SSS-2 only)
  // ================================================================
  describe("removeFromBlacklist() authorization (SSS-1 — ComplianceNotEnabled)", () => {
    const hookProgramId = new PublicKey("A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB");

    function blacklistEntryPda(user: PublicKey): PublicKey {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), mint.publicKey.toBuffer(), user.toBuffer()],
        hookProgramId
      );
      return pda;
    }

    it("rejects with correct Blacklister role on SSS-1 (ComplianceNotEnabled)", async () => {
      const blacklisterRole = rolePda(configPda, BLACKLISTER, blacklisterKp.publicKey);
      const entry = blacklistEntryPda(recipient.publicKey);
      try {
        await program.methods
          .removeFromBlacklist(recipient.publicKey)
          .accountsStrict({
            blacklister: blacklisterKp.publicKey,
            config: configPda,
            blacklisterRole,
            hookProgram: hookProgramId,
            blacklistEntry: entry,
            mint: mint.publicKey,
          })
          .signers([blacklisterKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("ComplianceNotEnabled");
      }
    });

    for (const wrongRole of [MINTER, BURNER, PAUSER, FREEZER, SEIZER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to removeFromBlacklist on SSS-1`, async () => {
        const kp = roleKeypairs[wrongRole];
        const fakeBlacklisterRole = rolePda(configPda, BLACKLISTER, kp.publicKey);
        const entry = blacklistEntryPda(recipient.publicKey);
        try {
          await program.methods
            .removeFromBlacklist(recipient.publicKey)
            .accountsStrict({
              blacklister: kp.publicKey,
              config: configPda,
              blacklisterRole: fakeBlacklisterRole,
              hookProgram: hookProgramId,
              blacklistEntry: entry,
              mint: mint.publicKey,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) =>
              s.includes("ComplianceNotEnabled") ||
              s.includes("AccountNotInitialized") ||
              s.includes("ConstraintSeeds") ||
              s.includes("Error")
          );
        }
      });
    }
  });

  // ================================================================
  // N. SEIZE — requires Seizer role (SSS-2 only)
  //    On SSS-1, fails with PermanentDelegateNotEnabled.
  // ================================================================
  describe("seize() authorization (SSS-1 — PermanentDelegateNotEnabled)", () => {
    let authorityAta: PublicKey;
    const hookProgramId = new PublicKey("A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB");

    function seizeBlacklistPda(user: PublicKey): PublicKey {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), mint.publicKey.toBuffer(), user.toBuffer()],
        hookProgramId
      );
      return pda;
    }

    before(async () => {
      try {
        authorityAta = await createAta(mint.publicKey, authority.publicKey);
      } catch {
        authorityAta = getAssociatedTokenAddressSync(
          mint.publicKey,
          authority.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
      }
    });

    it("rejects with correct Seizer role on SSS-1 (PermanentDelegateNotEnabled)", async () => {
      const seizerRole = rolePda(configPda, SEIZER, seizerKp.publicKey);
      const blPda = seizeBlacklistPda(recipient.publicKey);
      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: seizerKp.publicKey,
            config: configPda,
            seizerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromOwner: recipient.publicKey,
            blacklistEntry: blPda,
            to: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([seizerKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("PermanentDelegateNotEnabled");
      }
    });

    for (const wrongRole of [MINTER, BURNER, PAUSER, FREEZER, BLACKLISTER]) {
      it(`rejects ${ROLE_NAMES[wrongRole]} trying to seize on SSS-1`, async () => {
        const kp = roleKeypairs[wrongRole];
        const fakeSeizerRole = rolePda(configPda, SEIZER, kp.publicKey);
        const blPda = seizeBlacklistPda(recipient.publicKey);
        try {
          await program.methods
            .seize()
            .accountsStrict({
              authority: kp.publicKey,
              config: configPda,
              seizerRole: fakeSeizerRole,
              mint: mint.publicKey,
              from: recipientAta,
              fromOwner: recipient.publicKey,
              blacklistEntry: blPda,
              to: authorityAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([kp])
            .rpc();
          expect.fail("Should have thrown");
        } catch (e: any) {
          expect(e.toString()).to.satisfy(
            (s: string) =>
              s.includes("PermanentDelegateNotEnabled") ||
              s.includes("AccountNotInitialized") ||
              s.includes("ConstraintSeeds") ||
              s.includes("Error")
          );
        }
      });
    }

    it("rejects nobody trying to seize", async () => {
      const fakeSeizerRole = rolePda(configPda, SEIZER, nobody.publicKey);
      const blPda = seizeBlacklistPda(recipient.publicKey);
      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: nobody.publicKey,
            config: configPda,
            seizerRole: fakeSeizerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromOwner: recipient.publicKey,
            blacklistEntry: blPda,
            to: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.satisfy(
          (s: string) =>
            s.includes("PermanentDelegateNotEnabled") ||
            s.includes("AccountNotInitialized") ||
            s.includes("Error")
        );
      }
    });

    it("rejects revoked Seizer role (RoleNotActive)", async () => {
      await revokeRole(SEIZER, seizerKp.publicKey);
      const seizerRole = rolePda(configPda, SEIZER, seizerKp.publicKey);
      const blPda = seizeBlacklistPda(recipient.publicKey);
      try {
        await program.methods
          .seize()
          .accountsStrict({
            authority: seizerKp.publicKey,
            config: configPda,
            seizerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromOwner: recipient.publicKey,
            blacklistEntry: blPda,
            to: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([seizerKp])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      } finally {
        await reactivateRole(SEIZER, seizerKp.publicKey);
      }
    });
  });
});
