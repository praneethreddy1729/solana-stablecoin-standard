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
} from "@solana/spl-token";
import { expect } from "chai";

describe("registry-entry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace.SssTransferHook as Program<any>;

  const authority = provider.wallet.payer;

  // ---------- SSS-1 token (no hook, no delegate) ----------
  const mintSss1 = Keypair.generate();
  let configPdaSss1: PublicKey;
  let registryPdaSss1: PublicKey;

  // ---------- SSS-2 token (hook + permanent delegate) ----------
  const mintSss2 = Keypair.generate();
  let configPdaSss2: PublicKey;
  let registryPdaSss2: PublicKey;
  let extraAccountMetasSss2: PublicKey;

  before(async () => {
    // Derive PDAs for SSS-1
    [configPdaSss1] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintSss1.publicKey.toBuffer()],
      program.programId
    );
    [registryPdaSss1] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry"), mintSss1.publicKey.toBuffer()],
      program.programId
    );

    // Derive PDAs for SSS-2
    [configPdaSss2] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintSss2.publicKey.toBuffer()],
      program.programId
    );
    [registryPdaSss2] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry"), mintSss2.publicKey.toBuffer()],
      program.programId
    );
    [extraAccountMetasSss2] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintSss2.publicKey.toBuffer()],
      hookProgram.programId
    );
  });

  // ================================================================
  // SSS-1: basic stablecoin (no hook, no delegate)
  // ================================================================

  describe("SSS-1 initialize", () => {
    it("creates SSS-1 token and populates registry correctly", async () => {
      await program.methods
        .initialize({
          name: "Test Dollar",
          symbol: "TUSD",
          uri: "https://example.com/tusd.json",
          decimals: 6,
          enableTransferHook: false,
          enablePermanentDelegate: false,
          defaultAccountFrozen: false,
          treasury: getAssociatedTokenAddressSync(
            mintSss1.publicKey,
            authority.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
          ),
        })
        .accountsStrict({
          authority: authority.publicKey,
          config: configPdaSss1,
          mint: mintSss1.publicKey,
          registryEntry: registryPdaSss1,
          hookProgram: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintSss1])
        .rpc();

      // Fetch the registry entry and validate every field
      const registry = await program.account.registryEntry.fetch(registryPdaSss1);

      expect(registry.mint.toString()).to.equal(
        mintSss1.publicKey.toString(),
        "registry.mint must match the mint public key"
      );
      expect(registry.name).to.equal(
        "Test Dollar",
        "registry.name must match the init arg"
      );
      expect(registry.symbol).to.equal(
        "TUSD",
        "registry.symbol must match the init arg"
      );
      expect(registry.complianceLevel).to.equal(
        1,
        "SSS-1 token must have compliance_level = 1"
      );
      expect(registry.issuer.toString()).to.equal(
        authority.publicKey.toString(),
        "registry.issuer must be the initializing authority"
      );
      expect(registry.decimals).to.equal(
        6,
        "registry.decimals must match the init arg"
      );
      expect(registry.createdAt.toNumber()).to.be.greaterThan(
        0,
        "registry.created_at must be a positive timestamp"
      );
    });
  });

  // ================================================================
  // SSS-2: compliance stablecoin (hook + permanent delegate)
  // ================================================================

  describe("SSS-2 initialize", () => {
    it("creates SSS-2 token and populates registry with compliance_level = 2", async () => {
      // Initialize the SSS-2 token with both transfer hook and permanent delegate
      await program.methods
        .initialize({
          name: "Compliance USD",
          symbol: "CUSD",
          uri: "https://example.com/cusd.json",
          decimals: 9,
          enableTransferHook: true,
          enablePermanentDelegate: true,
          defaultAccountFrozen: false,
          treasury: getAssociatedTokenAddressSync(
            mintSss2.publicKey,
            authority.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
          ),
        })
        .accountsStrict({
          authority: authority.publicKey,
          config: configPdaSss2,
          mint: mintSss2.publicKey,
          registryEntry: registryPdaSss2,
          hookProgram: hookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintSss2])
        .rpc();

      // Initialize the extra account metas for the hook (required for SSS-2)
      await hookProgram.methods
        .initializeExtraAccountMetas()
        .accountsStrict({
          payer: authority.publicKey,
          mint: mintSss2.publicKey,
          config: configPdaSss2,
          extraAccountMetas: extraAccountMetasSss2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Fetch the registry entry and validate
      const registry = await program.account.registryEntry.fetch(registryPdaSss2);

      expect(registry.mint.toString()).to.equal(
        mintSss2.publicKey.toString(),
        "registry.mint must match the SSS-2 mint public key"
      );
      expect(registry.name).to.equal(
        "Compliance USD",
        "registry.name must match the init arg"
      );
      expect(registry.symbol).to.equal(
        "CUSD",
        "registry.symbol must match the init arg"
      );
      expect(registry.complianceLevel).to.equal(
        2,
        "SSS-2 token (hook + delegate) must have compliance_level = 2"
      );
      expect(registry.issuer.toString()).to.equal(
        authority.publicKey.toString(),
        "registry.issuer must be the initializing authority"
      );
      expect(registry.decimals).to.equal(
        9,
        "registry.decimals must match the init arg"
      );
      expect(registry.createdAt.toNumber()).to.be.greaterThan(
        0,
        "registry.created_at must be a positive timestamp"
      );
    });
  });
});
