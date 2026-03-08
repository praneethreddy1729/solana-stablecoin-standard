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

describe("admin-extended", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;

  const authority = provider.wallet.payer;
  const mint = Keypair.generate();

  // Role holders
  const minter = Keypair.generate();
  const minterB = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const blacklister = Keypair.generate();
  const recipient = Keypair.generate();
  const multiRoleUser = Keypair.generate();

  // Authority transfer chain keypairs
  const authorityB = Keypair.generate();
  const authorityC = Keypair.generate();

  // PDAs
  let configPda: PublicKey;

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

  async function fundKeypair(kp: Keypair, lamports: number = 2 * LAMPORTS_PER_SOL): Promise<void> {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports,
      })
    );
    await provider.sendAndConfirm(tx);
  }

  async function assignRole(roleType: number, assignee: PublicKey, active: boolean): Promise<void> {
    const role = rolePda(configPda, roleType, assignee);
    await program.methods
      .updateRoles(roleType, assignee, active)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async function setQuota(assignee: PublicKey, quota: number): Promise<void> {
    const role = rolePda(configPda, 0, assignee);
    await program.methods
      .updateMinter(new anchor.BN(quota))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: role,
      })
      .rpc();
  }

  async function doPause(): Promise<void> {
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
  }

  async function doUnpause(): Promise<void> {
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
  }

  async function ensureUnpaused(): Promise<void> {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    if (config.paused) {
      await doUnpause();
    }
  }

  async function ensurePaused(): Promise<void> {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    if (!config.paused) {
      await doPause();
    }
  }

  before(async () => {
    // Fund all keypairs via SystemProgram.transfer
    const keypairs = [
      minter, minterB, burner, pauser, freezer,
      blacklister, recipient, multiRoleUser, authorityB, authorityC,
    ];
    for (const kp of keypairs) {
      await fundKeypair(kp);
    }

    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Initialize a fresh mint for this test suite
    await program.methods
      .initialize({
        name: "AdminTestUSD",
        symbol: "ATUSD",
        uri: "https://example.com/atusd.json",
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

    // Assign core roles: minter, burner, pauser, freezer, blacklister
    await assignRole(0, minter.publicKey, true);
    await assignRole(1, burner.publicKey, true);
    await assignRole(2, pauser.publicKey, true);
    await assignRole(3, freezer.publicKey, true);
    await assignRole(4, blacklister.publicKey, true);

    // Set minter quota
    await setQuota(minter.publicKey, 1_000_000_000);

    // Create recipient ATA and mint some tokens for burn tests
    await createAta(recipient.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    await program.methods
      .mint(new anchor.BN(10_000_000))
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
  // Pause Coverage
  // ============================================================

  describe("pause coverage", () => {
    it("pause blocks mint", async () => {
      await ensureUnpaused();
      await doPause();

      const minterRole = rolePda(configPda, 0, minter.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mint(new anchor.BN(1_000))
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

      await doUnpause();
    });

    it("pause blocks burn", async () => {
      await ensureUnpaused();
      await doPause();

      const burnerRole = rolePda(configPda, 1, burner.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .burn(new anchor.BN(1_000))
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

      await doUnpause();
    });

    it("pause does NOT block freeze_account", async () => {
      await ensureUnpaused();
      await doPause();

      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Freeze should succeed even when paused
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

      await doUnpause();
    });

    it("pause does NOT block thaw_account", async () => {
      await ensureUnpaused();

      const freezerRole = rolePda(configPda, 3, freezer.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Ensure the account IS frozen before testing thaw-while-paused
      const acct = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      if (!acct.isFrozen) {
        const fSig = await program.methods
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
        await provider.connection.confirmTransaction(fSig, "confirmed");
      }

      await doPause();

      // Thaw should succeed even when paused
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

      await doUnpause();
    });

    it("pause does NOT block update_roles", async () => {
      await ensureUnpaused();
      await doPause();

      // Assign a new role while paused — should succeed
      const tempUser = Keypair.generate();
      await fundKeypair(tempUser);
      const role = rolePda(configPda, 0, tempUser.publicKey);

      await program.methods
        .updateRoles(0, tempUser.publicKey, true)
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
        .updateRoles(0, tempUser.publicKey, false)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await doUnpause();
    });

    it("pause does NOT block transfer_authority", async () => {
      await ensureUnpaused();
      await doPause();

      const tempAuth = Keypair.generate();
      await fundKeypair(tempAuth);

      // Initiate transfer while paused — should succeed
      await program.methods
        .transferAuthority(tempAuth.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toString()).to.equal(
        tempAuth.publicKey.toString()
      );

      // Cancel to clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      await doUnpause();
    });
  });

  // ============================================================
  // Role Management Extended
  // ============================================================

  describe("role management extended", () => {
    it("assigns all 5 role types successfully", async () => {
      const user = Keypair.generate();
      await fundKeypair(user);

      const roleTypes = [0, 1, 2, 3, 4]; // Minter, Burner, Pauser, Freezer, Blacklister
      for (const rt of roleTypes) {
        const role = rolePda(configPda, rt, user.publicKey);
        await program.methods
          .updateRoles(rt, user.publicKey, true)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const data = await program.account.roleAssignment.fetch(role);
        expect(data.isActive).to.equal(true);
        expect(data.roleType).to.equal(rt);
        expect(data.assignee.toString()).to.equal(user.publicKey.toString());
      }

      // Clean up
      for (const rt of roleTypes) {
        const role = rolePda(configPda, rt, user.publicKey);
        await program.methods
          .updateRoles(rt, user.publicKey, false)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            role,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
    });

    it("same user can hold multiple role types", async () => {
      await ensureUnpaused();
      // Assign minter + burner to the same multiRoleUser
      await assignRole(0, multiRoleUser.publicKey, true);
      await assignRole(1, multiRoleUser.publicKey, true);

      const minterRoleData = await program.account.roleAssignment.fetch(
        rolePda(configPda, 0, multiRoleUser.publicKey)
      );
      const burnerRoleData = await program.account.roleAssignment.fetch(
        rolePda(configPda, 1, multiRoleUser.publicKey)
      );

      expect(minterRoleData.isActive).to.equal(true);
      expect(minterRoleData.roleType).to.equal(0);
      expect(burnerRoleData.isActive).to.equal(true);
      expect(burnerRoleData.roleType).to.equal(1);

      // Set quota for multi-role user's minter role and verify minting works
      await setQuota(multiRoleUser.publicKey, 500_000);
      const multiAta = await createAta(multiRoleUser.publicKey);

      const mintSig = await program.methods
        .mint(new anchor.BN(100))
        .accountsStrict({
          minter: multiRoleUser.publicKey,
          config: configPda,
          minterRole: rolePda(configPda, 0, multiRoleUser.publicKey),
          mint: mint.publicKey,
          to: multiAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([multiRoleUser])
        .rpc();
      await provider.connection.confirmTransaction(mintSig, "confirmed");

      // Verify burn also works with the same user's burner role
      const burnSig = await program.methods
        .burn(new anchor.BN(50))
        .accountsStrict({
          burner: multiRoleUser.publicKey,
          config: configPda,
          burnerRole: rolePda(configPda, 1, multiRoleUser.publicKey),
          mint: mint.publicKey,
          from: multiAta,
          fromAuthority: multiRoleUser.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([multiRoleUser])
        .rpc();
      await provider.connection.confirmTransaction(burnSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        multiAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.equal(50);
    });

    it("deactivated role immediately blocks operations", async () => {
      await ensureUnpaused();
      // Create a temp minter, set quota, verify mint works, then deactivate and verify it fails
      const tempMinter = Keypair.generate();
      await fundKeypair(tempMinter);

      await assignRole(0, tempMinter.publicKey, true);
      await setQuota(tempMinter.publicKey, 1_000_000);

      const tempAta = await createAta(tempMinter.publicKey);
      const tempMinterRole = rolePda(configPda, 0, tempMinter.publicKey);

      // Mint succeeds
      await program.methods
        .mint(new anchor.BN(1_000))
        .accountsStrict({
          minter: tempMinter.publicKey,
          config: configPda,
          minterRole: tempMinterRole,
          mint: mint.publicKey,
          to: tempAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([tempMinter])
        .rpc();

      // Deactivate
      await assignRole(0, tempMinter.publicKey, false);

      // Mint should fail
      try {
        await program.methods
          .mint(new anchor.BN(1_000))
          .accountsStrict({
            minter: tempMinter.publicKey,
            config: configPda,
            minterRole: tempMinterRole,
            mint: mint.publicKey,
            to: tempAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([tempMinter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }
    });

    it("reactivated role immediately allows operations", async () => {
      await ensureUnpaused();
      // Use same temp minter concept: deactivate then reactivate
      const tempMinter = Keypair.generate();
      await fundKeypair(tempMinter);

      await assignRole(0, tempMinter.publicKey, true);
      await setQuota(tempMinter.publicKey, 1_000_000);
      const tempAta = await createAta(tempMinter.publicKey);
      const tempMinterRole = rolePda(configPda, 0, tempMinter.publicKey);

      // Deactivate
      await assignRole(0, tempMinter.publicKey, false);

      // Verify blocked
      try {
        await program.methods
          .mint(new anchor.BN(500))
          .accountsStrict({
            minter: tempMinter.publicKey,
            config: configPda,
            minterRole: tempMinterRole,
            mint: mint.publicKey,
            to: tempAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([tempMinter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("RoleNotActive");
      }

      // Reactivate
      await assignRole(0, tempMinter.publicKey, true);

      // Now mint should succeed
      const mintSig = await program.methods
        .mint(new anchor.BN(500))
        .accountsStrict({
          minter: tempMinter.publicKey,
          config: configPda,
          minterRole: tempMinterRole,
          mint: mint.publicKey,
          to: tempAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([tempMinter])
        .rpc();
      await provider.connection.confirmTransaction(mintSig, "confirmed");

      const account = await getAccount(
        provider.connection,
        tempAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.equal(500);
    });
  });

  // ============================================================
  // Minter Quota Extended
  // ============================================================

  describe("minter quota extended", () => {
    it("minter quota tracks cumulative minting", async () => {
      await ensureUnpaused();
      const qMinter = Keypair.generate();
      await fundKeypair(qMinter);

      await assignRole(0, qMinter.publicKey, true);
      await setQuota(qMinter.publicKey, 10_000_000);
      const qAta = await createAta(qMinter.publicKey);
      const qMinterRole = rolePda(configPda, 0, qMinter.publicKey);

      // Mint 100
      await program.methods
        .mint(new anchor.BN(100))
        .accountsStrict({
          minter: qMinter.publicKey,
          config: configPda,
          minterRole: qMinterRole,
          mint: mint.publicKey,
          to: qAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([qMinter])
        .rpc();

      // Mint 200
      await program.methods
        .mint(new anchor.BN(200))
        .accountsStrict({
          minter: qMinter.publicKey,
          config: configPda,
          minterRole: qMinterRole,
          mint: mint.publicKey,
          to: qAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([qMinter])
        .rpc();

      const roleData = await program.account.roleAssignment.fetch(qMinterRole);
      expect(roleData.mintedAmount.toNumber()).to.equal(300);
    });

    it("quota is per-minter, not global", async () => {
      await ensureUnpaused();
      // Minter A: quota 1000, mint 900 (90%)
      const minterA = Keypair.generate();
      await fundKeypair(minterA);
      await assignRole(0, minterA.publicKey, true);
      await setQuota(minterA.publicKey, 1_000);
      const ataA = await createAta(minterA.publicKey);
      const roleA = rolePda(configPda, 0, minterA.publicKey);

      await program.methods
        .mint(new anchor.BN(900))
        .accountsStrict({
          minter: minterA.publicKey,
          config: configPda,
          minterRole: roleA,
          mint: mint.publicKey,
          to: ataA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterA])
        .rpc();

      // Minter B: quota 1000, mint nothing yet (0%)
      await assignRole(0, minterB.publicKey, true);
      await setQuota(minterB.publicKey, 1_000);
      const ataB = await createAta(minterB.publicKey);
      const roleB = rolePda(configPda, 0, minterB.publicKey);

      // Minter B should be able to mint full 1000 despite A being at 90%
      await program.methods
        .mint(new anchor.BN(1_000))
        .accountsStrict({
          minter: minterB.publicKey,
          config: configPda,
          minterRole: roleB,
          mint: mint.publicKey,
          to: ataB,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterB])
        .rpc();

      const roleDataA = await program.account.roleAssignment.fetch(roleA);
      const roleDataB = await program.account.roleAssignment.fetch(roleB);
      expect(roleDataA.mintedAmount.toNumber()).to.equal(900);
      expect(roleDataB.mintedAmount.toNumber()).to.equal(1_000);
    });

    it("update_minter to lower value doesn't affect already-minted", async () => {
      await ensureUnpaused();
      const qMinter = Keypair.generate();
      await fundKeypair(qMinter);

      await assignRole(0, qMinter.publicKey, true);
      await setQuota(qMinter.publicKey, 1_000);
      const qAta = await createAta(qMinter.publicKey);
      const qMinterRole = rolePda(configPda, 0, qMinter.publicKey);

      // Mint 500
      await program.methods
        .mint(new anchor.BN(500))
        .accountsStrict({
          minter: qMinter.publicKey,
          config: configPda,
          minterRole: qMinterRole,
          mint: mint.publicKey,
          to: qAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([qMinter])
        .rpc();

      // Update quota to 600 (minted=500, remaining=100)
      await setQuota(qMinter.publicKey, 600);

      // Verify minted_amount is still 500
      let roleData = await program.account.roleAssignment.fetch(qMinterRole);
      expect(roleData.mintedAmount.toNumber()).to.equal(500);
      expect(roleData.minterQuota.toNumber()).to.equal(600);

      // Can mint 100 more (600 - 500)
      await program.methods
        .mint(new anchor.BN(100))
        .accountsStrict({
          minter: qMinter.publicKey,
          config: configPda,
          minterRole: qMinterRole,
          mint: mint.publicKey,
          to: qAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([qMinter])
        .rpc();

      // Cannot mint even 1 more
      try {
        await program.methods
          .mint(new anchor.BN(1))
          .accountsStrict({
            minter: qMinter.publicKey,
            config: configPda,
            minterRole: qMinterRole,
            mint: mint.publicKey,
            to: qAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([qMinter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("MinterQuotaExceeded");
      }
    });
  });

  // ============================================================
  // Authority Transfer Edge Cases
  // ============================================================

  describe("authority transfer edge cases", () => {
    it("authority transfer chain: A -> B -> C works", async () => {
      // Step 1: A (current authority) -> B
      await program.methods
        .transferAuthority(authorityB.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authorityB.publicKey,
          config: configPda,
        })
        .signers([authorityB])
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(authorityB.publicKey.toString());

      // Step 2: B -> C
      await program.methods
        .transferAuthority(authorityC.publicKey)
        .accountsStrict({
          authority: authorityB.publicKey,
          config: configPda,
        })
        .signers([authorityB])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authorityC.publicKey,
          config: configPda,
        })
        .signers([authorityC])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(authorityC.publicKey.toString());
      expect(config.pendingAuthority.toString()).to.equal(
        PublicKey.default.toString()
      );

      // Transfer back to original authority for remaining tests
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsStrict({
          authority: authorityC.publicKey,
          config: configPda,
        })
        .signers([authorityC])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
    });

    it("old authority rejected after transfer completes", async () => {
      // Transfer from A to B
      await program.methods
        .transferAuthority(authorityB.publicKey)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: authorityB.publicKey,
          config: configPda,
        })
        .signers([authorityB])
        .rpc();

      // A (old authority) tries to manage roles — should fail
      const tempUser = Keypair.generate();
      await fundKeypair(tempUser);
      const role = rolePda(configPda, 0, tempUser.publicKey);

      try {
        await program.methods
          .updateRoles(0, tempUser.publicKey, true)
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

      // Transfer back to original authority
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsStrict({
          authority: authorityB.publicKey,
          config: configPda,
        })
        .signers([authorityB])
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
});
