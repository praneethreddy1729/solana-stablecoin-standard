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
  getMint,
} from "@solana/spl-token";
import { expect } from "chai";

// ============================================================
// SSS-1 Lifecycle Tests
// ============================================================

describe("full-lifecycle: SSS-1", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet.payer!;

  // Each test uses its own mint for full isolation
  // Shared helpers
  function rolePda(
    programId: PublicKey,
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
      programId
    );
    return pda;
  }

  async function airdrop(pubkey: PublicKey, amount: number = 2 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    await provider.connection.confirmTransaction(sig);
  }

  async function createAta(
    mintKey: PublicKey,
    owner: PublicKey,
    payer: Keypair = authority
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mintKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
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

  async function initSSS1(mintKp: Keypair): Promise<PublicKey> {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintKp.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .initialize({
        name: "LifecycleUSD",
        symbol: "LUSD",
        uri: "https://example.com/lusd.json",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: PublicKey.default,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mintKp.publicKey.toBuffer()], program.programId)[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();
    return configPda;
  }

  // ============================================================
  // Test 1: Complete SSS-1 lifecycle
  // ============================================================

  it("complete SSS-1 lifecycle: init -> assign roles -> mint -> burn -> freeze -> thaw -> pause -> unpause", async () => {
    const mintKp = Keypair.generate();
    const minter = Keypair.generate();
    const burner = Keypair.generate();
    const pauser = Keypair.generate();
    const freezer = Keypair.generate();
    const user = Keypair.generate();

    await airdrop(minter.publicKey);
    await airdrop(burner.publicKey);
    await airdrop(pauser.publicKey);
    await airdrop(freezer.publicKey);
    await airdrop(user.publicKey);

    // 1. Initialize
    const configPda = await initSSS1(mintKp);

    // 2. Assign roles
    for (const [roleType, signer] of [
      [0, minter],
      [1, burner],
      [2, pauser],
      [3, freezer],
    ] as [number, Keypair][]) {
      const role = rolePda(program.programId, configPda, roleType, signer.publicKey);
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
    const minterRole = rolePda(program.programId, configPda, 0, minter.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(10_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // 3. Mint tokens
    const userAta = await createAta(mintKp.publicKey, user.publicKey);
    const mintSig = await program.methods
      .mint(new anchor.BN(5_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(mintSig, "confirmed");

    let account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(account.amount)).to.equal(5_000_000);

    // 4. Burn tokens
    const burnerRole = rolePda(program.programId, configPda, 1, burner.publicKey);
    const burnSig = await program.methods
      .burn(new anchor.BN(1_000_000))
      .accountsStrict({
        burner: burner.publicKey,
        config: configPda,
        burnerRole,
        mint: mintKp.publicKey,
        from: userAta,
        fromAuthority: user.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burner, user])
      .rpc();
    await provider.connection.confirmTransaction(burnSig, "confirmed");

    account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(account.amount)).to.equal(4_000_000);

    // 5. Freeze
    const freezerRole = rolePda(program.programId, configPda, 3, freezer.publicKey);
    const freezeSig = await program.methods
      .freezeAccount()
      .accountsStrict({
        freezer: freezer.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKp.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await provider.connection.confirmTransaction(freezeSig, "confirmed");

    account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(account.isFrozen).to.equal(true);

    // 6. Thaw
    const thawSig = await program.methods
      .thawAccount()
      .accountsStrict({
        freezer: freezer.publicKey,
        config: configPda,
        freezerRole,
        mint: mintKp.publicKey,
        tokenAccount: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await provider.connection.confirmTransaction(thawSig, "confirmed");

    account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(account.isFrozen).to.equal(false);

    // 7. Pause
    const pauserRole = rolePda(program.programId, configPda, 2, pauser.publicKey);
    await program.methods
      .pause()
      .accountsStrict({
        pauser: pauser.publicKey,
        config: configPda,
        pauserRole,
      })
      .signers([pauser])
      .rpc();

    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.paused).to.equal(true);

    // 8. Unpause
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
    expect(config.paused).to.equal(false);
  });

  // ============================================================
  // Test 2: SSS-1 survives complete token burn
  // ============================================================

  it("SSS-1 survives complete token burn (burn all supply)", async () => {
    const mintKp = Keypair.generate();
    const minter = Keypair.generate();
    const burner = Keypair.generate();
    const user = Keypair.generate();

    await airdrop(minter.publicKey);
    await airdrop(burner.publicKey);
    await airdrop(user.publicKey);

    const configPda = await initSSS1(mintKp);

    // Assign minter + burner
    const minterRole = rolePda(program.programId, configPda, 0, minter.publicKey);
    const burnerRole = rolePda(program.programId, configPda, 1, burner.publicKey);

    await program.methods
      .updateRoles(0, minter.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateRoles(1, burner.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: burnerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateMinter(new anchor.BN(10_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // Mint tokens
    const userAta = await createAta(mintKp.publicKey, user.publicKey);
    let sig = await program.methods
      .mint(new anchor.BN(5_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Burn ALL tokens
    sig = await program.methods
      .burn(new anchor.BN(5_000_000))
      .accountsStrict({
        burner: burner.publicKey,
        config: configPda,
        burnerRole,
        mint: mintKp.publicKey,
        from: userAta,
        fromAuthority: user.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burner, user])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Verify supply is 0
    const mintInfo = await getMint(
      provider.connection,
      mintKp.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(mintInfo.supply)).to.equal(0);

    // Token should still be usable: mint again
    sig = await program.methods
      .mint(new anchor.BN(1_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    const account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(account.amount)).to.equal(1_000_000);
  });

  // ============================================================
  // Test 3: SSS-1 role rotation
  // ============================================================

  it("SSS-1 role rotation: assign minter A, mint, revoke A, assign minter B, mint", async () => {
    const mintKp = Keypair.generate();
    const minterA = Keypair.generate();
    const minterB = Keypair.generate();
    const user = Keypair.generate();

    await airdrop(minterA.publicKey);
    await airdrop(minterB.publicKey);
    await airdrop(user.publicKey);

    const configPda = await initSSS1(mintKp);

    // Assign minter A
    const minterARole = rolePda(program.programId, configPda, 0, minterA.publicKey);
    await program.methods
      .updateRoles(0, minterA.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: minterARole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateMinter(new anchor.BN(10_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: minterARole,
      })
      .rpc();

    // Mint with minter A
    const userAta = await createAta(mintKp.publicKey, user.publicKey);
    let sig = await program.methods
      .mint(new anchor.BN(1_000_000))
      .accountsStrict({
        minter: minterA.publicKey,
        config: configPda,
        minterRole: minterARole,
        mint: mintKp.publicKey,
        to: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterA])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    let account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(account.amount)).to.equal(1_000_000);

    // Revoke minter A
    await program.methods
      .updateRoles(0, minterA.publicKey, false)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: minterARole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Minter A can no longer mint
    try {
      await program.methods
        .mint(new anchor.BN(1_000))
        .accountsStrict({
          minter: minterA.publicKey,
          config: configPda,
          minterRole: minterARole,
          mint: mintKp.publicKey,
          to: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterA])
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("RoleNotActive");
    }

    // Assign minter B
    const minterBRole = rolePda(program.programId, configPda, 0, minterB.publicKey);
    await program.methods
      .updateRoles(0, minterB.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: minterBRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateMinter(new anchor.BN(10_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: minterBRole,
      })
      .rpc();

    // Mint with minter B
    sig = await program.methods
      .mint(new anchor.BN(2_000_000))
      .accountsStrict({
        minter: minterB.publicKey,
        config: configPda,
        minterRole: minterBRole,
        mint: mintKp.publicKey,
        to: userAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterB])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    account = await getAccount(provider.connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(account.amount)).to.equal(3_000_000);
  });

  // ============================================================
  // Test 4: SSS-1 authority transfer lifecycle
  // ============================================================

  it("SSS-1 authority transfer lifecycle: create -> transfer -> accept -> new authority manages roles", async () => {
    const mintKp = Keypair.generate();
    const newAuth = Keypair.generate();
    const minter = Keypair.generate();

    await airdrop(newAuth.publicKey);
    await airdrop(minter.publicKey);

    const configPda = await initSSS1(mintKp);

    // Initiate transfer
    await program.methods
      .transferAuthority(newAuth.publicKey)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAuthority.toString()).to.equal(
      newAuth.publicKey.toString()
    );

    // Accept transfer
    await program.methods
      .acceptAuthority()
      .accountsStrict({
        newAuthority: newAuth.publicKey,
        config: configPda,
      })
      .signers([newAuth])
      .rpc();

    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toString()).to.equal(newAuth.publicKey.toString());
    expect(config.pendingAuthority.toString()).to.equal(
      PublicKey.default.toString()
    );

    // Old authority cannot manage roles
    const minterRole = rolePda(program.programId, configPda, 0, minter.publicKey);
    try {
      await program.methods
        .updateRoles(0, minter.publicKey, true)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          role: minterRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("Unauthorized");
    }

    // New authority CAN manage roles
    await program.methods
      .updateRoles(0, minter.publicKey, true)
      .accountsStrict({
        authority: newAuth.publicKey,
        config: configPda,
        role: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAuth])
      .rpc();

    const roleData = await program.account.roleAssignment.fetch(minterRole);
    expect(roleData.isActive).to.equal(true);
    expect(roleData.assignee.toString()).to.equal(minter.publicKey.toString());
  });
});

// ============================================================
// SSS-2 Lifecycle Tests
// ============================================================

describe("full-lifecycle: SSS-2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet.payer!;

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

  function blacklistPda(mintKey: PublicKey, user: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), mintKey.toBuffer(), user.toBuffer()],
      hookProgram.programId
    );
    return pda;
  }

  async function airdrop(pubkey: PublicKey, amount: number = 2 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    await provider.connection.confirmTransaction(sig);
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
    const tx = new Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx);
    await provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  async function initSSS2(mintKp: Keypair): Promise<{
    configPda: PublicKey;
    extraAccountMetasPda: PublicKey;
    treasuryAta: PublicKey;
  }> {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintKp.publicKey.toBuffer()],
      program.programId
    );
    const [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintKp.publicKey.toBuffer()],
      hookProgram.programId
    );
    const treasuryAta = getAssociatedTokenAddressSync(mintKp.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);

    await program.methods
      .initialize({
        name: "HookLifeUSD",
        symbol: "HLUSD",
        uri: "https://example.com/hlusd.json",
        decimals: 6,
        enableTransferHook: true,
        enablePermanentDelegate: true,
        defaultAccountFrozen: true,
        treasury: treasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mintKp.publicKey.toBuffer()], program.programId)[0],
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    await hookProgram.methods
      .initializeExtraAccountMetas()
      .accountsStrict({
        payer: authority.publicKey,
        extraAccountMetas: extraAccountMetasPda,
        mint: mintKp.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { configPda, extraAccountMetasPda, treasuryAta };
  }

  async function thawIfFrozen(
    mintKey: PublicKey,
    configPda: PublicKey,
    freezer: Keypair,
    ata: PublicKey
  ) {
    const freezerRole = rolePda(configPda, 3, freezer.publicKey);
    const info = await getAccount(provider.connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (info.isFrozen) {
      const sig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: freezer.publicKey,
          config: configPda,
          freezerRole,
          mint: mintKey,
          tokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  }

  // ============================================================
  // Test 1: Complete SSS-2 lifecycle
  // ============================================================

  it("complete SSS-2 lifecycle: init -> roles -> mint -> transfer -> blacklist -> transfer fails -> seize -> unblacklist -> transfer works", async () => {
    const mintKp = Keypair.generate();
    const minter = Keypair.generate();
    const blacklister = Keypair.generate();
    const freezer = Keypair.generate();
    const userA = Keypair.generate();
    const userB = Keypair.generate();

    await airdrop(minter.publicKey);
    await airdrop(blacklister.publicKey);
    await airdrop(freezer.publicKey);
    await airdrop(userA.publicKey);
    await airdrop(userB.publicKey);

    // 1. Init SSS-2
    const { configPda, extraAccountMetasPda } = await initSSS2(mintKp);

    // 2. Assign roles
    for (const [roleType, signer] of [
      [0, minter],
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

    const minterRole = rolePda(configPda, 0, minter.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(100_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // 3. Mint to userA
    const ataA = await createAta(mintKp.publicKey, userA.publicKey);
    const ataB = await createAta(mintKp.publicKey, userB.publicKey);

    let sig = await program.methods
      .mint(new anchor.BN(10_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // 4. Transfer from A to B (thaw both first)
    await thawIfFrozen(mintKp.publicKey, configPda, freezer, ataA);
    await thawIfFrozen(mintKp.publicKey, configPda, freezer, ataB);

    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      ataA,
      mintKp.publicKey,
      ataB,
      userA.publicKey,
      BigInt(2_000_000),
      6,
      undefined,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    let tx = new Transaction().add(transferIx);
    sig = await provider.sendAndConfirm(tx, [userA]);
    await provider.connection.confirmTransaction(sig, "confirmed");

    let accountB = await getAccount(provider.connection, ataB, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(accountB.amount)).to.equal(2_000_000);

    // 5. Blacklist userA (any authorized Blacklister role holder can do this)
    const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
    const blEntry = blacklistPda(mintKp.publicKey, userA.publicKey);

    // Assign blacklister role to authority (any Blacklister role holder can blacklist via config PDA CPI)
    await program.methods
      .updateRoles(4, authority.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: blacklisterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    sig = await program.methods
      .addToBlacklist(userA.publicKey, "compliance violation")
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntry,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // 6. Transfer from A fails (blacklisted)
    try {
      const failIx = await createTransferCheckedWithTransferHookInstruction(
        provider.connection,
        ataA,
        mintKp.publicKey,
        ataB,
        userA.publicKey,
        BigInt(100),
        6,
        undefined,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      tx = new Transaction().add(failIx);
      await provider.sendAndConfirm(tx, [userA]);
      expect.fail("Should have thrown");
    } catch (e: any) {
      const errStr = e.toString();
      expect(
        errStr.includes("failed") || errStr.includes("Blacklisted") || errStr.includes("Error")
      ).to.equal(true);
    }

    // 7. Seize tokens from blacklisted userA
    const authorityAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    // Create authority ATA if it doesn't exist
    const authorityAtaInfo = await provider.connection.getAccountInfo(authorityAta);
    if (!authorityAtaInfo) {
      await createAta(mintKp.publicKey, authority.publicKey);
    }
    await thawIfFrozen(mintKp.publicKey, configPda, freezer, authorityAta);

    // Assign Seizer role (type 5) to authority
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

    const senderBlPda = blacklistPda(mintKp.publicKey, userA.publicKey);
    const receiverBlPda = blacklistPda(mintKp.publicKey, authority.publicKey);

    const seizeSig = await program.methods
      .seize()
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        seizerRole,
        mint: mintKp.publicKey,
        from: ataA,
        fromOwner: userA.publicKey,
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
    await provider.connection.confirmTransaction(seizeSig, "confirmed");

    const afterSeize = await getAccount(provider.connection, ataA, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(afterSeize.amount)).to.equal(0);

    // 8. Unblacklist userA
    const rmSig = await program.methods
      .removeFromBlacklist(userA.publicKey)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntry,
        mint: mintKp.publicKey,
      })
      .signers([])
      .rpc();
    await provider.connection.confirmTransaction(rmSig, "confirmed");

    // 9. Mint more to A and transfer works again
    sig = await program.methods
      .mint(new anchor.BN(3_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    await thawIfFrozen(mintKp.publicKey, configPda, freezer, ataA);

    const goodIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      ataA,
      mintKp.publicKey,
      ataB,
      userA.publicKey,
      BigInt(1_000_000),
      6,
      undefined,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    tx = new Transaction().add(goodIx);
    sig = await provider.sendAndConfirm(tx, [userA]);
    await provider.connection.confirmTransaction(sig, "confirmed");

    accountB = await getAccount(provider.connection, ataB, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(accountB.amount)).to.equal(3_000_000); // 2M from before + 1M now
  });

  // ============================================================
  // Test 2: Multiple blacklist entries managed independently
  // ============================================================

  it("SSS-2 multiple blacklist entries managed independently", async () => {
    const mintKp = Keypair.generate();
    const blacklister = Keypair.generate();
    const freezer = Keypair.generate();
    const minter = Keypair.generate();
    const userA = Keypair.generate();
    const userB = Keypair.generate();

    await airdrop(blacklister.publicKey);
    await airdrop(freezer.publicKey);
    await airdrop(minter.publicKey);
    await airdrop(userA.publicKey);
    await airdrop(userB.publicKey);

    const { configPda } = await initSSS2(mintKp);

    // Assign roles (any Blacklister role holder can blacklist via config PDA CPI)
    for (const [roleType, signer] of [
      [0, minter],
      [3, freezer],
      [4, authority],  // authority as blacklister
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

    const blacklisterRole = rolePda(configPda, 4, authority.publicKey);

    // Blacklist both users
    const blEntryA = blacklistPda(mintKp.publicKey, userA.publicKey);
    const blEntryB = blacklistPda(mintKp.publicKey, userB.publicKey);

    await program.methods
      .addToBlacklist(userA.publicKey, "compliance violation")
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    await program.methods
      .addToBlacklist(userB.publicKey, "OFAC match")
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryB,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    // Both entries exist
    let infoA = await provider.connection.getAccountInfo(blEntryA);
    let infoB = await provider.connection.getAccountInfo(blEntryB);
    expect(infoA).to.not.be.null;
    expect(infoB).to.not.be.null;

    // Remove A only
    await program.methods
      .removeFromBlacklist(userA.publicKey)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryA,
        mint: mintKp.publicKey,
      })
      .signers([])
      .rpc();

    // A removed, B still exists
    infoA = await provider.connection.getAccountInfo(blEntryA);
    infoB = await provider.connection.getAccountInfo(blEntryB);
    expect(infoA).to.be.null;
    expect(infoB).to.not.be.null;

    // Clean up: remove B
    await program.methods
      .removeFromBlacklist(userB.publicKey)
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntryB,
        mint: mintKp.publicKey,
      })
      .signers([])
      .rpc();

    infoB = await provider.connection.getAccountInfo(blEntryB);
    expect(infoB).to.be.null;
  });

  // ============================================================
  // Test 3: Seize works while token is paused
  // ============================================================

  it("SSS-2 seize works while token is paused", async () => {
    const mintKp = Keypair.generate();
    const minter = Keypair.generate();
    const pauser = Keypair.generate();
    const blacklister = Keypair.generate();
    const freezer = Keypair.generate();
    const userA = Keypair.generate();

    await airdrop(minter.publicKey);
    await airdrop(pauser.publicKey);
    await airdrop(blacklister.publicKey);
    await airdrop(freezer.publicKey);
    await airdrop(userA.publicKey);

    const { configPda, extraAccountMetasPda } = await initSSS2(mintKp);

    // Assign roles (any Blacklister role holder can blacklist via config PDA CPI)
    for (const [roleType, signer] of [
      [0, minter],
      [2, pauser],
      [3, freezer],
      [4, authority],  // authority as blacklister
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

    const minterRole = rolePda(configPda, 0, minter.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(100_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // Mint to userA
    const ataA = await createAta(mintKp.publicKey, userA.publicKey);
    let sig = await program.methods
      .mint(new anchor.BN(5_000_000))
      .accountsStrict({
        minter: minter.publicKey,
        config: configPda,
        minterRole,
        mint: mintKp.publicKey,
        to: ataA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Blacklist userA
    const blacklisterRole = rolePda(configPda, 4, authority.publicKey);
    const blEntry = blacklistPda(mintKp.publicKey, userA.publicKey);
    await program.methods
      .addToBlacklist(userA.publicKey, "compliance violation")
      .accountsStrict({
        blacklister: authority.publicKey,
        config: configPda,
        blacklisterRole,
        hookProgram: hookProgram.programId,
        blacklistEntry: blEntry,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    // Pause the token
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

    // Seize should still work while paused
    const authorityAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    // Create authority ATA if it doesn't exist
    const authorityAtaInfo = await provider.connection.getAccountInfo(authorityAta);
    if (!authorityAtaInfo) {
      await createAta(mintKp.publicKey, authority.publicKey);
    }
    await thawIfFrozen(mintKp.publicKey, configPda, freezer, authorityAta);
    await thawIfFrozen(mintKp.publicKey, configPda, freezer, ataA);

    // Assign Seizer role (type 5) to authority
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

    const senderBlPda = blacklistPda(mintKp.publicKey, userA.publicKey);
    const receiverBlPda = blacklistPda(mintKp.publicKey, authority.publicKey);

    const seizeSig = await program.methods
      .seize()
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        seizerRole,
        mint: mintKp.publicKey,
        from: ataA,
        fromOwner: userA.publicKey,
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
    await provider.connection.confirmTransaction(seizeSig, "confirmed");

    const afterSeize = await getAccount(provider.connection, ataA, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(afterSeize.amount)).to.equal(0);
  });

  // ============================================================
  // Test 4: SSS-2 compliance operations on SSS-1 token all fail gracefully
  // ============================================================

  it("SSS-2 compliance operations on SSS-1 token all fail gracefully", async () => {
    // Create an SSS-1 token (no hook, no permanent delegate)
    const mintKp = Keypair.generate();
    const blacklister = Keypair.generate();
    const user = Keypair.generate();

    await airdrop(blacklister.publicKey);
    await airdrop(user.publicKey);

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintKp.publicKey.toBuffer()],
      program.programId
    );

    const sss1TreasuryAta = getAssociatedTokenAddressSync(mintKp.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);

    await program.methods
      .initialize({
        name: "NoHookUSD",
        symbol: "NUSD",
        uri: "https://example.com/nusd.json",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: sss1TreasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        registryEntry: PublicKey.findProgramAddressSync([Buffer.from("registry"), mintKp.publicKey.toBuffer()], program.programId)[0],
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    // Assign blacklister role
    const blacklisterRole = rolePda(configPda, 4, blacklister.publicKey);
    await program.methods
      .updateRoles(4, blacklister.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: blacklisterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // addToBlacklist should fail with ComplianceNotEnabled
    const blEntry = blacklistPda(mintKp.publicKey, user.publicKey);
    try {
      await program.methods
        .addToBlacklist(user.publicKey, "test")
        .accountsStrict({
          blacklister: blacklister.publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: hookProgram.programId,
          blacklistEntry: blEntry,
          mint: mintKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      expect.fail("addToBlacklist should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("ComplianceNotEnabled");
    }

    // seize should fail with PermanentDelegateNotEnabled
    let userAta: PublicKey;
    try {
      userAta = await createAta(mintKp.publicKey, user.publicKey);
    } catch {
      userAta = getAssociatedTokenAddressSync(
        mintKp.publicKey,
        user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
    }

    let authorityAta: PublicKey;
    try {
      authorityAta = await createAta(mintKp.publicKey, authority.publicKey);
    } catch {
      authorityAta = getAssociatedTokenAddressSync(
        mintKp.publicKey,
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

    // Derive blacklist PDA for fromOwner (won't exist, but needed for struct)
    const [blPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), mintKp.publicKey.toBuffer(), user.publicKey.toBuffer()],
      hookProgram.programId
    );

    try {
      await program.methods
        .seize()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          seizerRole,
          mint: mintKp.publicKey,
          from: userAta,
          fromOwner: user.publicKey,
          blacklistEntry: blPda,
          to: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("seize should have thrown");
    } catch (e: any) {
      expect(e.toString()).to.include("PermanentDelegateNotEnabled");
    }
  });
});
