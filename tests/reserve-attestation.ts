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
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("reserve-attestation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;
  const authority = provider.wallet.payer;

  // SSS-1 mint (for update_treasury tests)
  const sss1Mint = Keypair.generate();
  // SSS-2 mint (with hook + permanent delegate, for attestation tests)
  const mint = Keypair.generate();

  // Role holders
  const minter = Keypair.generate();
  const pauser = Keypair.generate();
  const attestor = Keypair.generate();
  const randomUser = Keypair.generate();
  const recipient = Keypair.generate();

  let sss1ConfigPda: PublicKey;
  let configPda: PublicKey;
  let extraAccountMetasPda: PublicKey;
  let treasuryAta: PublicKey;
  let sss1TreasuryAta: PublicKey;
  let recipientAta: PublicKey;

  // Helper: derive role PDA
  function rolePda(
    cfg: PublicKey,
    roleType: number,
    assignee: PublicKey
  ): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        cfg.toBuffer(),
        Buffer.from([roleType]),
        assignee.toBuffer(),
      ],
      program.programId
    );
    return pda;
  }

  // Helper: derive attestation PDA
  function attestationPda(cfg: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestation"), cfg.toBuffer()],
      program.programId
    );
    return pda;
  }

  // Helper: derive extra account metas PDA
  function extraMetasPda(mintKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintKey.toBuffer()],
      hookProgram.programId
    );
    return pda;
  }

  // Helper: create ATA
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
    const sig = await provider.sendAndConfirm(new Transaction().add(ix));
    await provider.connection.confirmTransaction(sig, "confirmed");
    return ata;
  }

  // Helper: mint tokens
  async function mintTokensTo(
    cfg: PublicKey,
    mintKey: PublicKey,
    to: PublicKey,
    amount: number
  ): Promise<void> {
    const sig = await program.methods
      .mint(new anchor.BN(amount))
      .accountsStrict({
        minter: minter.publicKey,
        config: cfg,
        minterRole: rolePda(cfg, 0, minter.publicKey),
        mint: mintKey,
        to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  // Helper: submit attestation
  async function submitAttestation(
    reserveAmount: number,
    expiresInSeconds: number,
    uri: string,
    signerKp: Keypair = attestor
  ): Promise<string> {
    const sig = await program.methods
      .attestReserves(
        new anchor.BN(reserveAmount),
        new anchor.BN(expiresInSeconds),
        uri
      )
      .accountsStrict({
        attestor: signerKp.publicKey,
        config: configPda,
        attestorRole: rolePda(configPda, 6, signerKp.publicKey),
        mint: mint.publicKey,
        attestation: attestationPda(configPda),
        systemProgram: SystemProgram.programId,
      })
      .signers([signerKp])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  before(async () => {
    // Airdrop to all keypairs
    for (const kp of [minter, pauser, attestor, randomUser, recipient]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // ===== Initialize SSS-1 mint (for update_treasury tests) =====
    [sss1ConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), sss1Mint.publicKey.toBuffer()],
      program.programId
    );

    sss1TreasuryAta = getAssociatedTokenAddressSync(
      sss1Mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .initialize({
        name: "TreasuryTest",
        symbol: "TTST",
        uri: "",
        decimals: 6,
        enableTransferHook: false,
        enablePermanentDelegate: false,
        defaultAccountFrozen: false,
        treasury: sss1TreasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: sss1ConfigPda,
        mint: sss1Mint.publicKey,
        hookProgram: null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();

    // ===== Initialize SSS-2 mint (with hook + permanent delegate) =====
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
    extraAccountMetasPda = extraMetasPda(mint.publicKey);

    treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const initSig = await program.methods
      .initialize({
        name: "AttestTest",
        symbol: "ATST",
        uri: "",
        decimals: 6,
        enableTransferHook: true,
        enablePermanentDelegate: true,
        defaultAccountFrozen: false,
        treasury: treasuryAta,
      })
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        hookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();
    await provider.connection.confirmTransaction(initSig, "confirmed");

    // Initialize extra account metas for transfer hook
    const initExtraSig = await hookProgram.methods
      .initializeExtraAccountMetas()
      .accountsStrict({
        payer: authority.publicKey,
        extraAccountMetas: extraAccountMetasPda,
        mint: mint.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(initExtraSig, "confirmed");

    // ===== Assign roles on SSS-2 =====
    // Minter (0)
    await program.methods
      .updateRoles(0, minter.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: rolePda(configPda, 0, minter.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Pauser (2)
    await program.methods
      .updateRoles(2, pauser.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: rolePda(configPda, 2, pauser.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Attestor (6)
    await program.methods
      .updateRoles(6, attestor.publicKey, true)
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        role: rolePda(configPda, 6, attestor.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Set minter quota
    await program.methods
      .updateMinter(new anchor.BN(1_000_000_000))
      .accountsStrict({
        authority: authority.publicKey,
        config: configPda,
        minterRole: rolePda(configPda, 0, minter.publicKey),
      })
      .rpc();

    // Create recipient ATA and mint some tokens so supply > 0
    recipientAta = await createAta(mint.publicKey, recipient.publicKey);
    await mintTokensTo(configPda, mint.publicKey, recipientAta, 1_000_000);
  });

  // ============================================================
  // update_treasury
  // ============================================================

  describe("update_treasury", () => {
    it("authority updates treasury to a valid token account — succeeds", async () => {
      // Use recipient's ATA as the new treasury (any valid pubkey works)
      const newTreasury = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .updateTreasury(newTreasury)
        .accountsStrict({
          authority: authority.publicKey,
          config: sss1ConfigPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        sss1ConfigPda
      );
      expect(config.treasury.toString()).to.equal(newTreasury.toString());
    });

    it("non-authority cannot update treasury — fails (Unauthorized)", async () => {
      const fakeTreasury = Keypair.generate().publicKey;
      try {
        await program.methods
          .updateTreasury(fakeTreasury)
          .accountsStrict({
            authority: randomUser.publicKey,
            config: sss1ConfigPda,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Unauthorized");
      }
    });

    it("update treasury to Pubkey.default() — fails (InvalidTreasury)", async () => {
      try {
        await program.methods
          .updateTreasury(PublicKey.default)
          .accountsStrict({
            authority: authority.publicKey,
            config: sss1ConfigPda,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidTreasury");
      }
    });
  });

  // ============================================================
  // attest_reserves
  // ============================================================

  describe("attest_reserves", () => {
    it("attestor submits adequate attestation (reserves >= supply) — paused_by_attestation stays false", async () => {
      // reserves = 2_000_000 >= supply = 1_000_000
      await submitAttestation(2_000_000, 3600, "https://audit.example.com/report1");

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pausedByAttestation).to.equal(false);

      const attestation = await program.account.reserveAttestation.fetch(
        attestationPda(configPda)
      );
      expect(attestation.reserveAmount.toNumber()).to.equal(2_000_000);
      expect(attestation.tokenSupply.toNumber()).to.equal(1_000_000);
      expect(attestation.isValid).to.equal(true);
      expect(attestation.attestationUri).to.equal(
        "https://audit.example.com/report1"
      );
      expect(attestation.attestor.toString()).to.equal(
        attestor.publicKey.toString()
      );
    });

    it("attestor submits undercollateralized attestation (reserves < supply) — paused_by_attestation set to true", async () => {
      // reserves = 500_000 < supply = 1_000_000
      await submitAttestation(500_000, 3600, "https://audit.example.com/under");

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pausedByAttestation).to.equal(true);

      const attestation = await program.account.reserveAttestation.fetch(
        attestationPda(configPda)
      );
      expect(attestation.reserveAmount.toNumber()).to.equal(500_000);
    });

    it("after undercollateralized attestation, mint fails (Undercollateralized)", async () => {
      // config.paused_by_attestation is true from previous test
      try {
        await mintTokensTo(configPda, mint.publicKey, recipientAta, 1_000);
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("Undercollateralized");
      }
    });

    it("after adequate attestation, paused_by_attestation clears and mint works again", async () => {
      // Submit adequate attestation: reserves = 2_000_000 >= supply = 1_000_000
      await submitAttestation(2_000_000, 3600, "https://audit.example.com/ok");

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pausedByAttestation).to.equal(false);

      // Mint should work now
      const beforeAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(beforeAccount.amount);

      await mintTokensTo(configPda, mint.publicKey, recipientAta, 50_000);

      const afterAccount = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(afterAccount.amount)).to.equal(beforeAmount + 50_000);
    });

    it("non-attestor cannot submit attestation — fails (seeds mismatch)", async () => {
      try {
        await submitAttestation(1_000_000, 3600, "https://fake.com", randomUser);
        expect.fail("Should have thrown");
      } catch (e: any) {
        // PDA seeds mismatch — randomUser doesn't have an attestor role PDA
        expect(e).to.exist;
      }
    });

    it("attestation with URI > 256 bytes — fails (AttestationUriTooLong)", async () => {
      const longUri = "https://example.com/" + "x".repeat(256);
      try {
        await submitAttestation(1_000_000, 3600, longUri);
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("AttestationUriTooLong");
      }
    });

    it("attestation with expires_in_seconds <= 0 — fails (InvalidExpiration)", async () => {
      try {
        await submitAttestation(1_000_000, 0, "https://example.com/zero");
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.error.errorCode.code).to.equal("InvalidExpiration");
      }
    });

    it("pauser can unpause even when paused_by_attestation is true", async () => {
      // First, set paused_by_attestation to true via undercollateralized attestation
      await submitAttestation(100, 3600, "https://audit.example.com/low");

      let config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pausedByAttestation).to.equal(true);

      // Pauser unpauses — should clear both paused and paused_by_attestation
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

      config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(false);
      expect(config.pausedByAttestation).to.equal(false);

      // Mint should work again
      await mintTokensTo(configPda, mint.publicKey, recipientAta, 1_000);
    });
  });
});
