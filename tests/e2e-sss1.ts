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

  const authority = provider.wallet.payer;
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

  it("completes full SSS-1 lifecycle", async () => {
    // ----- Airdrop -----
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

    // ----- Derive config PDA -----
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );

    // ----- Step 1: Create SSS-1 Mint -----
    await program.methods
      .initialize({
        name: "E2E-USD",
        symbol: "E2EUSD",
        uri: "https://example.com/e2e.json",
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

    let config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.decimals).to.equal(6);
    expect(config.paused).to.equal(false);

    // ----- Step 2: Assign all roles -----
    const roles: [number, Keypair][] = [
      [0, minter],
      [1, burner],
      [2, pauser],
      [3, freezer],
    ];
    for (const [roleType, signer] of roles) {
      const role = rolePda(roleType, signer.publicKey);
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

    // ----- Step 3: Set minter quota -----
    const minterRole = rolePda(0, minter.publicKey);
    await program.methods
      .updateMinter(new anchor.BN(50_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
      })
      .rpc();

    // ----- Step 4: Create recipient ATA -----
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

    // ----- Step 5: Mint tokens -----
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

    let account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(10_000_000);

    // ----- Step 6: Burn tokens -----
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

    account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(9_000_000);

    // ----- Step 7: Freeze -----
    const freezerRole = rolePda(3, freezer.publicKey);
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

    account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(true);

    // ----- Step 8: Thaw -----
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

    account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.equal(false);

    // ----- Step 9: Pause -----
    const pauserRole = rolePda(2, pauser.publicKey);
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
    expect(config.paused).to.equal(true);

    // ----- Step 10: Unpause -----
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

    // ----- Step 11: Transfer authority -----
    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.pendingAuthority.toString()).to.equal(
      newAuthority.publicKey.toString()
    );

    // ----- Step 12: Accept authority -----
    await program.methods
      .acceptAuthority()
      .accountsStrict({
        newAuthority: newAuthority.publicKey,
        config: configPda,
      })
      .signers([newAuthority])
      .rpc();

    config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.authority.toString()).to.equal(
      newAuthority.publicKey.toString()
    );
    expect(config.pendingAuthority.toString()).to.equal(
      PublicKey.default.toString()
    );

    // ----- Verify final state -----
    account = await getAccount(
      provider.connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(9_000_000);
    expect(account.isFrozen).to.equal(false);
  });
});
