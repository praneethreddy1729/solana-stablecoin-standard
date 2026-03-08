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
  getAccount,
  getMint,
} from "@solana/spl-token";
import { expect } from "chai";

describe("invariants", () => {
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
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Initialize SSS-1 stablecoin
    await program.methods
      .initialize({
        name: "InvariantUSD",
        symbol: "IUSD",
        uri: "https://example.com/iusd.json",
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
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    // Assign all roles
    for (const [roleType, signer] of [
      [0, minter],
      [1, burner],
      [2, pauser],
      [3, freezer],
      [4, blacklister],
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
      .updateMinter(new anchor.BN(10_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();
  });

  // ============================================================
  // 1. Supply conservation: mint increases supply by exact amount
  // ============================================================

  it("supply conservation: after mint, token supply increased by exact amount", async () => {
    const recipientAta = await createAta(recipient.publicKey);
    const minterRole = rolePda(configPda, 0, minter.publicKey);

    const mintInfoBefore = await getMint(
      provider.connection,
      mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const supplyBefore = mintInfoBefore.supply;

    const mintAmount = 1_000_000;
    const sig = await program.methods
      .mint(new anchor.BN(mintAmount))
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

    const mintInfoAfter = await getMint(
      provider.connection,
      mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(mintInfoAfter.supply - supplyBefore)).to.equal(mintAmount);
  });

  // ============================================================
  // 2. Supply conservation: burn decreases supply by exact amount
  // ============================================================

  it("supply conservation: after burn, token supply decreased by exact amount", async () => {
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const burnerRole = rolePda(configPda, 1, burner.publicKey);

    const mintInfoBefore = await getMint(
      provider.connection,
      mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const supplyBefore = mintInfoBefore.supply;

    const burnAmount = 200_000;
    const sig = await program.methods
      .burn(new anchor.BN(burnAmount))
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
    await provider.connection.confirmTransaction(sig, "confirmed");

    const mintInfoAfter = await getMint(
      provider.connection,
      mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(supplyBefore - mintInfoAfter.supply)).to.equal(burnAmount);
  });

  // ============================================================
  // 3. Balance accounting: user balance + total burned = total minted to user
  // ============================================================

  it("balance accounting: user balance + burned = total minted to user", async () => {
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    const burnerRole = rolePda(configPda, 1, burner.publicKey);

    // Mint additional tokens
    const mintAmount = 500_000;
    let sig = await program.methods
      .mint(new anchor.BN(mintAmount))
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

    // Burn some more
    const burnAmount = 100_000;
    sig = await program.methods
      .burn(new anchor.BN(burnAmount))
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
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Total minted to this ATA: 1_000_000 + 500_000 = 1_500_000
    // Total burned from this ATA: 200_000 + 100_000 = 300_000
    // Expected balance: 1_500_000 - 300_000 = 1_200_000
    const account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const totalMinted = 1_000_000 + 500_000;
    const totalBurned = 200_000 + 100_000;
    expect(Number(account.amount)).to.equal(totalMinted - totalBurned);
  });

  // ============================================================
  // 4. Quota tracking: minted_amount in RoleAssignment matches actual mints
  // ============================================================

  it("quota tracking: minted_amount in RoleAssignment matches actual cumulative mints", async () => {
    const minterRole = rolePda(configPda, 0, minter.publicKey);

    const roleData = await program.account.roleAssignment.fetch(minterRole);
    // We minted 1_000_000 + 500_000 = 1_500_000 total
    expect(roleData.mintedAmount.toNumber()).to.equal(1_500_000);
  });

  // ============================================================
  // 5. Pause state persists: paused token stays paused after failed ops
  // ============================================================

  it("pause state persists: paused token stays paused after failed mint attempt", async () => {
    const pauserRole = rolePda(configPda, 2, pauser.publicKey);
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

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

    // Confirm paused
    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);

    // Attempt mint (should fail)
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

    // Verify still paused after the failed operation
    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);

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

  // ============================================================
  // 6. Freeze state: frozen account stays frozen after failed transfer attempt
  // ============================================================

  it("freeze state: frozen account stays frozen after failed burn attempt", async () => {
    const freezerRole = rolePda(configPda, 3, freezer.publicKey);
    const burnerRole = rolePda(configPda, 1, burner.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Freeze the account
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

    // Verify frozen
    let account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(true);

    // Attempt burn on frozen account (should fail)
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
      // Expected to fail (account frozen at token level)
      expect(e).to.exist;
    }

    // Verify still frozen
    account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(true);

    // Thaw for subsequent tests
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
  });

  // ============================================================
  // 7. Role state consistency: deactivated role stays deactivated
  // ============================================================

  it("role state consistency: deactivated role stays deactivated after failed mint", async () => {
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Deactivate minter role
    await program.methods
      .updateRoles(0, minter.publicKey, false)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    let roleData = await program.account.roleAssignment.fetch(minterRole);
    expect(roleData.isActive).to.equal(false);

    // Attempt mint with deactivated role (should fail)
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
      expect(e.error.errorCode.code).to.equal("RoleNotActive");
    }

    // Verify role is still deactivated
    roleData = await program.account.roleAssignment.fetch(minterRole);
    expect(roleData.isActive).to.equal(false);

    // Reactivate for subsequent tests
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

  // ============================================================
  // 8. Config immutability: mint address in config never changes
  // ============================================================

  it("config immutability: mint address in config never changes after operations", async () => {
    const configBefore = await program.account.stablecoinConfig.fetch(configPda);
    const originalMint = configBefore.mint.toString();

    // Perform several operations and check config.mint stays the same
    const minterRole = rolePda(configPda, 0, minter.publicKey);
    const pauserRole = rolePda(configPda, 2, pauser.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint
    await program.methods
      .mint(new anchor.BN(100_000))
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

    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.mint.toString()).to.equal(originalMint);

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

    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.mint.toString()).to.equal(originalMint);

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

    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.mint.toString()).to.equal(originalMint);
    expect(config.mint.toString()).to.equal(mint.publicKey.toString());
  });

  // ============================================================
  // 9. Authority state: pending_authority set correctly during transfer
  // ============================================================

  it("authority state: pending_authority set correctly during transfer", async () => {
    const newAuthority = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      newAuthority.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Before transfer, pending_authority should be default (zero)
    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAuthority.toString()).to.equal(
      PublicKey.default.toString()
    );

    // Initiate transfer
    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    // pending_authority should be set to newAuthority
    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAuthority.toString()).to.equal(
      newAuthority.publicKey.toString()
    );

    // Authority should still be original
    expect(config.authority.toString()).to.equal(
      authority.publicKey.toString()
    );

    // Cancel to clean up
    await program.methods
      .cancelAuthorityTransfer()
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    // Verify cleaned up
    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAuthority.toString()).to.equal(
      PublicKey.default.toString()
    );
  });

  // ============================================================
  // 10. Hook state: blacklist on SSS-1 fails (ComplianceNotEnabled)
  //     and config remains unchanged
  // ============================================================

  it("hook state: SSS-1 config unchanged after failed blacklist attempt", async () => {
    const blacklisterRole = rolePda(configPda, 4, blacklister.publicKey);
    const [blacklistEntry] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        mint.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
      ],
      hookProgram.programId
    );

    const configBefore = await program.account.stablecoinConfig.fetch(configPda);

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

    // Config should be completely unchanged
    const configAfter = await program.account.stablecoinConfig.fetch(configPda);
    expect(configAfter.authority.toString()).to.equal(
      configBefore.authority.toString()
    );
    expect(configAfter.mint.toString()).to.equal(
      configBefore.mint.toString()
    );
    expect(configAfter.paused).to.equal(configBefore.paused);
    expect(configAfter.enableTransferHook).to.equal(
      configBefore.enableTransferHook
    );
    expect(configAfter.enablePermanentDelegate).to.equal(
      configBefore.enablePermanentDelegate
    );
  });

  // ============================================================
  // 11. Supply matches sum of all ATA balances
  // ============================================================

  it("supply matches sum of all token account balances", async () => {
    // Mint to a second recipient to have multiple ATAs
    const secondRecipient = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      secondRecipient.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const secondAta = await createAta(secondRecipient.publicKey);
    const minterRole = rolePda(configPda, 0, minter.publicKey);

    const sig = await program.methods
      .mint(new anchor.BN(250_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mint.publicKey,
        to: secondAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Get balances of both ATAs
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const account1 = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const account2 = await getAccount(
      provider.connection,
      secondAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const totalBalance = Number(account1.amount) + Number(account2.amount);

    // Get supply
    const mintInfo = await getMint(
      provider.connection,
      mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    expect(Number(mintInfo.supply)).to.equal(totalBalance);
  });
});
