import * as anchor from "@coral-xyz/anchor";
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
  getAccount,
} from "@solana/spl-token";
import { Wallet } from "@coral-xyz/anchor";
import { expect } from "chai";
import BN from "bn.js";
import {
  SolanaStablecoin,
  Preset,
  Presets,
  RoleType,
  findConfigPda,
  findRolePda,
  findExtraAccountMetasPda,
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../sdk/core/src";
import { SssTransferHook } from "../target/types/sss_transfer_hook";

describe("sdk-integration", () => {
  const opts: anchor.web3.ConfirmOptions = {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  };
  const connection = new anchor.web3.Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899",
    "confirmed"
  );
  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
    opts
  );
  anchor.setProvider(provider);
  const authority = (provider.wallet as Wallet).payer;
  const wallet = new Wallet(authority);

  const hookProgram = anchor.workspace
    .SssTransferHook as anchor.Program<SssTransferHook>;

  // Helper: confirm a transaction signature
  async function confirm(sig: string) {
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction(
      { signature: sig, ...latestBlockhash },
      "confirmed"
    );
  }

  // Helper: fund a keypair from the provider authority
  async function fund(kp: Keypair, sol = 2) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports: sol * LAMPORTS_PER_SOL,
      })
    );
    const sig = await provider.sendAndConfirm(tx);
    await confirm(sig);
  }

  // Helper: create an ATA for a given mint + owner (Token-2022)
  async function createAta(
    mintPubkey: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mintPubkey,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      ata,
      owner,
      mintPubkey,
      TOKEN_2022_PROGRAM_ID
    );
    const sig = await provider.sendAndConfirm(new Transaction().add(ix));
    await confirm(sig);
    return ata;
  }

  // ========================================================================
  // SSS-1 Tests (tests 1-22)
  // ========================================================================
  describe("SSS-1", () => {
    let stablecoin: SolanaStablecoin;
    let mintKeypair: Keypair;
    let txSig: string;
    let recipientAta: PublicKey;
    const recipient = Keypair.generate();
    const newAuth = Keypair.generate();

    // -------------------------------------------------------------------
    // SolanaStablecoin.create()
    // -------------------------------------------------------------------
    describe("SolanaStablecoin.create()", () => {
      it("1. creates SSS-1 stablecoin via SDK", async () => {
        const result = await SolanaStablecoin.create(connection, {
          name: "TestUSD",
          symbol: "TUSD",
          uri: "",
          decimals: 6,
          authority,
          preset: Preset.SSS_1,
        });
        stablecoin = result.stablecoin;
        mintKeypair = result.mintKeypair;
        txSig = result.txSig;

        expect(txSig).to.be.a("string");
        expect(txSig.length).to.be.greaterThan(0);
      });

      it("2. creates SSS-2 stablecoin via SDK", async () => {
        const result = await SolanaStablecoin.create(connection, {
          name: "ComplianceUSD",
          symbol: "CUSD",
          uri: "",
          decimals: 6,
          authority,
          preset: Preset.SSS_2,
        });
        expect(result.txSig).to.be.a("string");
        expect(result.stablecoin.mintAddress).to.be.instanceOf(PublicKey);
      });

      it("3. creates stablecoin with Presets.SSS_1 alias", async () => {
        const result = await SolanaStablecoin.create(connection, {
          name: "AliasUSD",
          symbol: "AUSD",
          uri: "",
          decimals: 6,
          authority,
          preset: Presets.SSS_1,
        });
        expect(result.txSig).to.be.a("string");
      });

      it("4. created stablecoin has correct mintAddress", () => {
        expect(stablecoin.mintAddress.equals(mintKeypair.publicKey)).to.equal(
          true
        );
      });

      it("5. created stablecoin has correct configPda", () => {
        const [expected] = findConfigPda(mintKeypair.publicKey);
        expect(stablecoin.configPda.equals(expected)).to.equal(true);
      });

      it("6. created stablecoin has correct programId", () => {
        expect(stablecoin.programId.equals(SSS_TOKEN_PROGRAM_ID)).to.equal(
          true
        );
      });
    });

    // -------------------------------------------------------------------
    // SolanaStablecoin.load()
    // -------------------------------------------------------------------
    describe("SolanaStablecoin.load()", () => {
      it("7. loads existing stablecoin by mint address", async () => {
        const loaded = await SolanaStablecoin.load(
          connection,
          wallet,
          mintKeypair.publicKey
        );
        expect(loaded).to.be.instanceOf(SolanaStablecoin);
      });

      it("8. loaded stablecoin has same mintAddress", async () => {
        const loaded = await SolanaStablecoin.load(
          connection,
          wallet,
          mintKeypair.publicKey
        );
        expect(loaded.mintAddress.equals(mintKeypair.publicKey)).to.equal(true);
      });
    });

    // -------------------------------------------------------------------
    // getConfig() and getTotalSupply()
    // -------------------------------------------------------------------
    describe("getConfig() and getTotalSupply()", () => {
      it("9. getConfig returns valid config with correct authority", async () => {
        const config = await stablecoin.getConfig();
        expect(config.authority.equals(authority.publicKey)).to.equal(true);
      });

      it("10. getConfig shows correct decimals and paused=false", async () => {
        const config = await stablecoin.getConfig();
        expect(config.decimals).to.equal(6);
        expect(config.paused).to.equal(false);
      });

      it("11. getTotalSupply returns 0n before minting", async () => {
        const supply = await stablecoin.getTotalSupply();
        expect(supply).to.equal(BigInt(0));
      });
    });

    // -------------------------------------------------------------------
    // Role Management via SDK
    // -------------------------------------------------------------------
    describe("Role Management via SDK", () => {
      it("12. updateRoles assigns Minter role", async () => {
        await stablecoin.updateRoles({
          roleType: RoleType.Minter,
          assignee: authority.publicKey,
          isActive: true,
        });

        const [rolePda] = findRolePda(
          stablecoin.configPda,
          RoleType.Minter,
          authority.publicKey
        );
        const roleAccount =
          await stablecoin.program.account.roleAssignment.fetch(rolePda);
        expect(roleAccount.isActive).to.equal(true);
        expect(roleAccount.roleType).to.equal(RoleType.Minter);
      });

      it("13. updateMinterQuota sets quota", async () => {
        const [minterRole] = findRolePda(
          stablecoin.configPda,
          RoleType.Minter,
          authority.publicKey
        );

        await stablecoin.updateMinterQuota({
          minterRole,
          newQuota: new BN(1_000_000_000),
        });

        const roleAccount =
          await stablecoin.program.account.roleAssignment.fetch(minterRole);
        expect(roleAccount.minterQuota.toNumber()).to.equal(1_000_000_000);
      });
    });

    // -------------------------------------------------------------------
    // Mint/Burn via SDK
    // -------------------------------------------------------------------
    describe("Mint/Burn via SDK", () => {
      before(async () => {
        await fund(recipient);
        recipientAta = await createAta(
          mintKeypair.publicKey,
          recipient.publicKey
        );

        // Assign Burner role to authority
        const sig = await stablecoin.updateRoles({
          roleType: RoleType.Burner,
          assignee: authority.publicKey,
          isActive: true,
        });
        await confirm(sig);
      });

      it("14. SDK mint() sends tokens to recipient", async () => {
        await stablecoin.mint(
          recipientAta,
          new BN(50_000_000),
          authority.publicKey
        );

        const account = await getAccount(
          connection,
          recipientAta,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        expect(Number(account.amount)).to.equal(50_000_000);
      });

      it("15. getTotalSupply reflects minted amount", async () => {
        const supply = await stablecoin.getTotalSupply();
        expect(supply).to.equal(BigInt(50_000_000));
      });

      it("16. SDK burn() reduces supply", async () => {
        // Create authority ATA, transfer tokens there, then burn
        const authorityAta = await createAta(
          mintKeypair.publicKey,
          authority.publicKey
        );
        // Mint to authority ATA
        await stablecoin.mint(
          authorityAta,
          new BN(10_000_000),
          authority.publicKey
        );

        const supplyBefore = await stablecoin.getTotalSupply();

        await stablecoin.burn(
          authorityAta,
          new BN(5_000_000),
          authority.publicKey
        );

        const supplyAfter = await stablecoin.getTotalSupply();
        expect(supplyAfter).to.equal(supplyBefore - BigInt(5_000_000));
      });
    });

    // -------------------------------------------------------------------
    // Freeze/Thaw via SDK
    // -------------------------------------------------------------------
    describe("Freeze/Thaw via SDK", () => {
      before(async () => {
        // Assign Freezer role to authority
        const sig = await stablecoin.updateRoles({
          roleType: RoleType.Freezer,
          assignee: authority.publicKey,
          isActive: true,
        });
        await confirm(sig);
      });

      it("17. SDK freeze() freezes account", async () => {
        await stablecoin.freeze({
          tokenAccount: recipientAta,
          freezer: authority.publicKey,
        });

        const account = await getAccount(
          connection,
          recipientAta,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        expect(account.isFrozen).to.equal(true);
      });

      it("18. SDK thaw() thaws account", async () => {
        await stablecoin.thaw({
          tokenAccount: recipientAta,
          freezer: authority.publicKey,
        });

        const account = await getAccount(
          connection,
          recipientAta,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        expect(account.isFrozen).to.equal(false);
      });
    });

    // -------------------------------------------------------------------
    // Pause/Unpause via SDK
    // -------------------------------------------------------------------
    describe("Pause/Unpause via SDK", () => {
      before(async () => {
        // Assign Pauser role to authority
        const sig = await stablecoin.updateRoles({
          roleType: RoleType.Pauser,
          assignee: authority.publicKey,
          isActive: true,
        });
        await confirm(sig);
      });

      it("19. SDK pause() pauses token", async () => {
        await stablecoin.pause({ pauser: authority.publicKey });

        const config = await stablecoin.getConfig();
        expect(config.paused).to.equal(true);
      });

      it("20. SDK unpause() unpauses token", async () => {
        await stablecoin.unpause({ pauser: authority.publicKey });

        const config = await stablecoin.getConfig();
        expect(config.paused).to.equal(false);
      });
    });

    // -------------------------------------------------------------------
    // Authority Transfer via SDK
    // -------------------------------------------------------------------
    describe("Authority Transfer via SDK", () => {
      before(async () => {
        await fund(newAuth);
      });

      it("21. SDK transferAuthority initiates transfer", async () => {
        await stablecoin.transferAuthority(newAuth.publicKey);

        const config = await stablecoin.getConfig();
        expect(config.pendingAuthority.equals(newAuth.publicKey)).to.equal(
          true
        );
      });

      it("22. SDK cancelAuthorityTransfer cancels it", async () => {
        await stablecoin.cancelAuthorityTransfer();

        const config = await stablecoin.getConfig();
        expect(config.pendingAuthority.equals(PublicKey.default)).to.equal(
          true
        );
      });
    });
  });

  // ========================================================================
  // SSS-2 Compliance Tests (tests 23-26)
  // ========================================================================
  describe("SSS-2 Compliance", () => {
    let sss2: SolanaStablecoin;
    let sss2MintKeypair: Keypair;
    const targetUser = Keypair.generate();

    before(async () => {
      await fund(targetUser);

      // Create SSS-2 stablecoin
      const result = await SolanaStablecoin.create(connection, {
        name: "ComplianceTest",
        symbol: "CTEST",
        uri: "",
        decimals: 6,
        authority,
        preset: Preset.SSS_2,
      });
      sss2 = result.stablecoin;
      sss2MintKeypair = result.mintKeypair;

      // Initialize extra account metas for the transfer hook
      const [extraMetasPda] = findExtraAccountMetasPda(
        sss2MintKeypair.publicKey
      );
      const hookSig = await hookProgram.methods
        .initializeExtraAccountMetas()
        .accountsStrict({
          payer: authority.publicKey,
          extraAccountMetas: extraMetasPda,
          mint: sss2MintKeypair.publicKey,
          config: sss2.configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirm(hookSig);

      // Assign Blacklister role to authority
      const roleSig = await sss2.updateRoles({
        roleType: RoleType.Blacklister,
        assignee: authority.publicKey,
        isActive: true,
      });
      await confirm(roleSig);
    });

    it("23. compliance.blacklistAdd adds address", async () => {
      await sss2.compliance.blacklistAdd(
        targetUser.publicKey,
        authority.publicKey,
        "SDK test blacklist"
      );

      // Verify the blacklist PDA exists on-chain
      const isBlacklisted = await sss2.compliance.isBlacklisted(
        targetUser.publicKey
      );
      expect(isBlacklisted).to.equal(true);
    });

    it("24. compliance.isBlacklisted returns true", async () => {
      const result = await sss2.compliance.isBlacklisted(targetUser.publicKey);
      expect(result).to.equal(true);
    });

    it("25. compliance.blacklistRemove removes address", async () => {
      await sss2.compliance.blacklistRemove(
        targetUser.publicKey,
        authority.publicKey
      );
    });

    it("26. compliance.isBlacklisted returns false after removal", async () => {
      const result = await sss2.compliance.isBlacklisted(targetUser.publicKey);
      expect(result).to.equal(false);
    });
  });
});
