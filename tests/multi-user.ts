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

describe("multi-user", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet.payer!;
  const mint = Keypair.generate();

  // Multiple minters
  const minterA = Keypair.generate();
  const minterB = Keypair.generate();

  // Other role holders
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const blacklister = Keypair.generate();

  // Recipients
  const recipientA = Keypair.generate();
  const recipientB = Keypair.generate();

  // For authority transfer tests
  const newAuthority = Keypair.generate();

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
    const signers = [
      minterA,
      minterB,
      burner,
      pauser,
      freezer,
      blacklister,
      recipientA,
      recipientB,
      newAuthority,
    ];
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
        name: "MultiUSD",
        symbol: "MUSD",
        uri: "https://example.com/musd.json",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: PublicKey.default,
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

    // Assign minter roles to both minterA and minterB
    for (const m of [minterA, minterB]) {
      const role = rolePda(configPda, 0, m.publicKey);
      await program.methods
        .updateRoles(0, m.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // Assign other roles
    const otherRoles = [
      { type: 1, assignee: burner },
      { type: 2, assignee: pauser },
      { type: 3, assignee: freezer },
      { type: 4, assignee: blacklister },
    ];
    for (const r of otherRoles) {
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

    // Set quotas: minterA=1_000_000, minterB=500_000
    const minterARole = rolePda(configPda, 0, minterA.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(1_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: minterARole,
      })
      .rpc();

    const minterBRole = rolePda(configPda, 0, minterB.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(500_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: minterBRole,
      })
      .rpc();

    // Create recipient ATAs
    await createAta(recipientA.publicKey);
    await createAta(recipientB.publicKey);
  });

  // ============================================================
  // 1. Multiple Minters with Independent Quotas
  // ============================================================

  describe("Multiple Minters with Independent Quotas", () => {
    it("minterA mints within their own quota", async () => {
      const minterARole = rolePda(configPda, 0, minterA.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientA.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .mint(new anchor.BN(400_000))
        .accountsStrict({
          minter: minterA.publicKey,
          config: configPda,
          minterRole: minterARole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterA])
        .rpc();

      const role = await program.account.roleAssignment.fetch(minterARole);
      expect(role.mintedAmount.toNumber()).to.equal(400_000);
    });

    it("minterB mints independently — quota unaffected by minterA", async () => {
      const minterBRole = rolePda(configPda, 0, minterB.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientB.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .mint(new anchor.BN(300_000))
        .accountsStrict({
          minter: minterB.publicKey,
          config: configPda,
          minterRole: minterBRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterB])
        .rpc();

      const role = await program.account.roleAssignment.fetch(minterBRole);
      expect(role.mintedAmount.toNumber()).to.equal(300_000);
      // minterA's quota is separate
      expect(role.minterQuota.toNumber()).to.equal(500_000);
    });

    it("minterA's minted_amount is unchanged by minterB's minting", async () => {
      const minterARole = rolePda(configPda, 0, minterA.publicKey);
      const role = await program.account.roleAssignment.fetch(minterARole);
      expect(role.mintedAmount.toNumber()).to.equal(400_000);
      expect(role.minterQuota.toNumber()).to.equal(1_000_000);
    });

    it("minterB exceeds own quota while minterA still has headroom", async () => {
      const minterBRole = rolePda(configPda, 0, minterB.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientB.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // minterB has 500_000 quota, already minted 300_000 — try minting 250_000 (exceeds)
      try {
        await program.methods
          .mint(new anchor.BN(250_000))
          .accountsStrict({
            minter: minterB.publicKey,
            config: configPda,
            minterRole: minterBRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterB])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("MinterQuotaExceeded");
      }
    });
  });

  // ============================================================
  // 2. Multiple Roles to Same User
  // ============================================================

  describe("Multiple Roles to Same User", () => {
    it("assigns both minter and burner roles to the same user", async () => {
      // Give minterA the burner role as well
      const minterABurnerRole = rolePda(configPda, 1, minterA.publicKey);
      await program.methods
        .updateRoles(1, minterA.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterABurnerRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const data = await program.account.roleAssignment.fetch(
        minterABurnerRole
      );
      expect(data.isActive).to.equal(true);
      expect(data.roleType).to.equal(1);
      expect(data.assignee.toString()).to.equal(minterA.publicKey.toString());
    });

    it("dual-role user can mint (using minter role)", async () => {
      const minterARole = rolePda(configPda, 0, minterA.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientA.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const sig = await program.methods
        .mint(new anchor.BN(10_000))
        .accountsStrict({
          minter: minterA.publicKey,
          config: configPda,
          minterRole: minterARole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterA])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      // recipientA had 400_000 + 10_000 = 410_000
      expect(Number(account.amount)).to.equal(410_000);
    });

    it("dual-role user can burn (using burner role)", async () => {
      const minterABurnerRole = rolePda(configPda, 1, minterA.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientA.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const sig = await program.methods
        .burn(new anchor.BN(5_000))
        .accountsStrict({
          burner: minterA.publicKey,
          config: configPda,
          burnerRole: minterABurnerRole,
          mint: mint.publicKey,
          from: recipientAta,
          fromAuthority: recipientA.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterA, recipientA])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.equal(405_000);
    });
  });

  // ============================================================
  // 3. Role Revocation
  // ============================================================

  describe("Role Revocation", () => {
    it("minter mints, role revoked, then cannot mint", async () => {
      const minterBRole = rolePda(configPda, 0, minterB.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientB.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Confirm minterB can still mint
      await program.methods
        .mint(new anchor.BN(50_000))
        .accountsStrict({
          minter: minterB.publicKey,
          config: configPda,
          minterRole: minterBRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterB])
        .rpc();

      // Revoke minterB's role
      await program.methods
        .updateRoles(0, minterB.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterBRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Attempt to mint again — should fail
      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: minterB.publicKey,
            config: configPda,
            minterRole: minterBRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterB])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }

      // Re-enable for cleanup
      await program.methods
        .updateRoles(0, minterB.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterBRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  });

  // ============================================================
  // 4. Separation of Duties
  // ============================================================

  describe("Separation of Duties", () => {
    it("blacklister cannot mint (PDA mismatch)", async () => {
      const blacklisterRole = rolePda(configPda, 4, blacklister.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientA.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: blacklister.publicKey,
            config: configPda,
            minterRole: blacklisterRole,
            mint: mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([blacklister])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA seed mismatch: blacklisterRole was derived with type=4, mint expects type=0
        expect(e.toString()).to.include("Error");
      }
    });

    it("minter cannot pause (PDA mismatch)", async () => {
      const minterARole = rolePda(configPda, 0, minterA.publicKey);

      try {
        await program.methods
          .pause()
          .accountsStrict({
            pauser: minterA.publicKey,
            config: configPda,
            pauserRole: minterARole,
          })
          .signers([minterA])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });

    it("freezer cannot burn (PDA mismatch)", async () => {
      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipientA.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .burn(new anchor.BN(1_000))
          .accountsStrict({
            burner: freezer.publicKey,
            config: configPda,
            burnerRole: freezerRole,
            mint: mint.publicKey,
            from: recipientAta,
            fromAuthority: recipientA.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer, recipientA])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });
  });

  // ============================================================
  // 5. Authority Transfer: Old vs New Authority
  // ============================================================

  describe("Authority Transfer", () => {
    it("transfers authority and old authority cannot manage roles", async () => {
      // Transfer authority to newAuthority
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

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

      // Old authority tries to assign a role — should fail
      const randomUser = Keypair.generate();
      const role = rolePda(configPda, 0, randomUser.publicKey);

      try {
        await program.methods
          .updateRoles(0, randomUser.publicKey, true)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("new authority can manage roles after transfer", async () => {
      const randomUser = Keypair.generate();
      const role = rolePda(configPda, 0, randomUser.publicKey);

      await program.methods
        .updateRoles(0, randomUser.publicKey, true)
        .accountsStrict({
          authority: newAuthority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .signers([newAuthority])
        .rpc();

      const data = await program.account.roleAssignment.fetch(role);
      expect(data.isActive).to.equal(true);
      expect(data.assignee.toString()).to.equal(randomUser.publicKey.toString());
    });

    it("new authority can update minter quotas", async () => {
      const minterARole = rolePda(configPda, 0, minterA.publicKey);

      await program.methods
        .updateMinter(new anchor.BN(2_000_000))
        .accountsStrict({
          authority: newAuthority.publicKey,
          config: configPda,
          minterRole: minterARole,
        })
        .signers([newAuthority])
        .rpc();

      const role = await program.account.roleAssignment.fetch(minterARole);
      expect(role.minterQuota.toNumber()).to.equal(2_000_000);
    });

    it("restores original authority for cleanup", async () => {
      // Transfer back
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

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
    });
  });
});
