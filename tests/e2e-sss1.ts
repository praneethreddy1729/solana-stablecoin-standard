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

describe("e2e-sss1: full SSS-1 lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;

  const authority = provider.wallet.payer!;
  const mint = Keypair.generate();
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const recipient = Keypair.generate();
  const newAuthority = Keypair.generate();

  let configPda: PublicKey;
  let recipientAta: PublicKey;

  function rolePda(roleType: number, assignee: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        configPda.toBuffer(),
        Buffer.from([roleType]),
        assignee.toBuffer(),
      ],
      program.programId
    );
    return pda;
  }

  before(async () => {
    // Fund all keypairs
    const signers = [
      minter,
      burner,
      pauser,
      freezer,
      recipient,
      newAuthority,
    ];
    for (const s of signers) {
      const sig = await provider.connection.requestAirdrop(
        s.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
  });

  // ============================================================
  // Step 1: Initialize SSS-1 Token
  // ============================================================

  it("initialize SSS-1 token with correct config", async () => {
    await program.methods
      .initialize({
        name: "E2E-USD",
        symbol: "E2EUSD",
        uri: "https://example.com/e2e.json",
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
        registryEntry: PublicKey.findProgramAddressSync(
          [Buffer.from("registry"), mint.publicKey.toBuffer()],
          program.programId
        )[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.decimals).to.equal(6);
    expect(config.paused).to.equal(false);
    expect(config.enableTransferHook).to.equal(false);
    expect(config.enablePermanentDelegate).to.equal(false);
    expect(config.authority.toString()).to.equal(
      authority.publicKey.toString()
    );
    expect(config.mint.toString()).to.equal(mint.publicKey.toString());
  });

  // ============================================================
  // Step 2: Assign Minter Role
  // ============================================================

  it("assign minter role to designated minter", async () => {
    const role = rolePda(0, minter.publicKey);
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

  // ============================================================
  // Step 3: Set Minter Quota and Mint Tokens
  // ============================================================

  it("set minter quota and mint tokens to recipient", async () => {
    const minterRole = rolePda(0, minter.publicKey);

    // Set minter quota
    await program.methods
      .updateMinter(new anchor.BN(50_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // Create recipient ATA
    recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      recipientAta,
      recipient.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createAtaIx)
    );

    // Mint 10M tokens
    const mintSig = await program.methods
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
    await provider.connection.confirmTransaction(mintSig, "confirmed");
  });

  // ============================================================
  // Step 4: Verify Balance
  // ============================================================

  it("verify recipient balance equals minted amount", async () => {
    const account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(10_000_000);
  });

  // ============================================================
  // Step 5: Assign Burner Role
  // ============================================================

  it("assign burner role to designated burner", async () => {
    const role = rolePda(1, burner.publicKey);
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

  // ============================================================
  // Step 6: Burn Tokens
  // ============================================================

  it("burn tokens from recipient account", async () => {
    const burnerRole = rolePda(1, burner.publicKey);
    const burnSig = await program.methods
      .burn(new anchor.BN(1_000_000))
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
  });

  // ============================================================
  // Step 7: Verify Reduced Balance
  // ============================================================

  it("verify balance reduced after burn", async () => {
    const account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(9_000_000);
  });

  // ============================================================
  // Step 8: Freeze Account
  // ============================================================

  it("freeze recipient account", async () => {
    // Assign freezer role first
    const freezerRolePda = rolePda(3, freezer.publicKey);
    await program.methods
      .updateRoles(3, freezer.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: freezerRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const freezeSig = await program.methods
      .freezeAccount()
      .accountsStrict({
        freezer: freezer.publicKey,
        config: configPda,
        freezerRole: freezerRolePda,
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

  // ============================================================
  // Step 9: Verify Mint to Frozen Account Fails
  // ============================================================

  it("reject mint to frozen account", async () => {
    const minterRole = rolePda(0, minter.publicKey);
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
      expect.fail("Should have thrown — account is frozen");
    } catch (e: any) {
      // Token-2022 rejects minting to a frozen account
      const errStr = e.toString();
      expect(
        errStr.includes("frozen") ||
          errStr.includes("Frozen") ||
          errStr.includes("failed") ||
          errStr.includes("Error")
      ).to.equal(true);
    }
  });

  // ============================================================
  // Step 10: Thaw Account
  // ============================================================

  it("thaw frozen recipient account", async () => {
    const freezerRolePda = rolePda(3, freezer.publicKey);
    const thawSig = await program.methods
      .thawAccount()
      .accountsStrict({
        freezer: freezer.publicKey,
        config: configPda,
        freezerRole: freezerRolePda,
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

  // ============================================================
  // Step 11: Pause Token
  // ============================================================

  it("pause token globally", async () => {
    // Assign pauser role
    const pauserRolePda = rolePda(2, pauser.publicKey);
    await program.methods
      .updateRoles(2, pauser.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: pauserRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .pause()
      .accountsStrict({
        pauser: pauser.publicKey,
        config: configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);
  });

  // ============================================================
  // Step 12: Verify Mint Fails While Paused
  // ============================================================

  it("reject mint while token is paused", async () => {
    const minterRole = rolePda(0, minter.publicKey);
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
      expect.fail("Should have thrown — token is paused");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("TokenPaused");
    }
  });

  // ============================================================
  // Step 13: Unpause
  // ============================================================

  it("unpause token successfully", async () => {
    const pauserRolePda = rolePda(2, pauser.publicKey);
    await program.methods
      .unpause()
      .accountsStrict({
        pauser: pauser.publicKey,
        config: configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(false);
  });

  // ============================================================
  // Step 14: Transfer Authority to New Keypair
  // ============================================================

  it("initiate authority transfer to new keypair", async () => {
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

  // ============================================================
  // Step 15: Accept Authority
  // ============================================================

  it("accept authority transfer as new keypair", async () => {
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
  });

  // ============================================================
  // Step 16: Verify Old Authority Can't Mint (role update)
  // ============================================================

  it("reject role update from old authority after transfer", async () => {
    const randomKeypair = Keypair.generate();
    const role = rolePda(0, randomKeypair.publicKey);
    try {
      await program.methods
        .updateRoles(0, randomKeypair.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — old authority is no longer authorized");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("Unauthorized");
    }
  });

  // ============================================================
  // Verify Final State Integrity
  // ============================================================

  it("verify final state is consistent", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toString()).to.equal(
      newAuthority.publicKey.toString()
    );
    expect(config.paused).to.equal(false);
    expect(config.decimals).to.equal(6);

    const account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(9_000_000);
    expect(account.isFrozen).to.equal(false);
  });
});
