import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ATTESTATION_SEED,
  REGISTRY_SEED,
} from "../src/constants";

// Also verify re-exports from index
import {
  SSS_TOKEN_PROGRAM_ID as IndexTokenId,
  SSS_TRANSFER_HOOK_PROGRAM_ID as IndexHookId,
  CONFIG_SEED as IndexConfigSeed,
} from "../src/index";

// ---------------------------------------------------------------------------
// 1. Program IDs
// ---------------------------------------------------------------------------

describe("Program IDs", () => {
  it("SSS_TOKEN_PROGRAM_ID is a valid PublicKey", () => {
    expect(SSS_TOKEN_PROGRAM_ID).to.be.instanceOf(PublicKey);
  });

  it("SSS_TRANSFER_HOOK_PROGRAM_ID is a valid PublicKey", () => {
    expect(SSS_TRANSFER_HOOK_PROGRAM_ID).to.be.instanceOf(PublicKey);
  });

  it("TOKEN_2022_PROGRAM_ID is a valid PublicKey", () => {
    expect(TOKEN_2022_PROGRAM_ID).to.be.instanceOf(PublicKey);
  });

  it("SSS_TOKEN_PROGRAM_ID matches expected base58", () => {
    expect(SSS_TOKEN_PROGRAM_ID.toBase58()).to.equal(
      "tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz"
    );
  });

  it("SSS_TRANSFER_HOOK_PROGRAM_ID matches expected base58", () => {
    expect(SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58()).to.equal(
      "A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB"
    );
  });

  it("program IDs are different from each other", () => {
    expect(SSS_TOKEN_PROGRAM_ID.equals(SSS_TRANSFER_HOOK_PROGRAM_ID)).to.be.false;
  });

  it("neither program ID equals TOKEN_2022_PROGRAM_ID", () => {
    expect(SSS_TOKEN_PROGRAM_ID.equals(TOKEN_2022_PROGRAM_ID)).to.be.false;
    expect(SSS_TRANSFER_HOOK_PROGRAM_ID.equals(TOKEN_2022_PROGRAM_ID)).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// 2. PDA seed constants
// ---------------------------------------------------------------------------

describe("PDA seed constants", () => {
  it("CONFIG_SEED = 'config'", () => {
    expect(CONFIG_SEED.toString()).to.equal("config");
  });

  it("ROLE_SEED = 'role'", () => {
    expect(ROLE_SEED.toString()).to.equal("role");
  });

  it("BLACKLIST_SEED = 'blacklist'", () => {
    expect(BLACKLIST_SEED.toString()).to.equal("blacklist");
  });

  it("EXTRA_ACCOUNT_METAS_SEED = 'extra-account-metas'", () => {
    expect(EXTRA_ACCOUNT_METAS_SEED.toString()).to.equal("extra-account-metas");
  });

  it("ATTESTATION_SEED = 'attestation'", () => {
    expect(ATTESTATION_SEED.toString()).to.equal("attestation");
  });

  it("REGISTRY_SEED = 'registry'", () => {
    expect(REGISTRY_SEED.toString()).to.equal("registry");
  });

  it("all seeds are Buffer instances", () => {
    const seeds = [CONFIG_SEED, ROLE_SEED, BLACKLIST_SEED, EXTRA_ACCOUNT_METAS_SEED, ATTESTATION_SEED, REGISTRY_SEED];
    for (const seed of seeds) {
      expect(Buffer.isBuffer(seed)).to.be.true;
    }
  });

  it("all seed strings are unique", () => {
    const seeds = [CONFIG_SEED, ROLE_SEED, BLACKLIST_SEED, EXTRA_ACCOUNT_METAS_SEED, ATTESTATION_SEED, REGISTRY_SEED];
    const strs = seeds.map((s) => s.toString());
    expect(new Set(strs).size).to.equal(6);
  });
});

// ---------------------------------------------------------------------------
// 3. Index re-exports
// ---------------------------------------------------------------------------

describe("Constants re-exports from index", () => {
  it("SSS_TOKEN_PROGRAM_ID is re-exported", () => {
    expect(IndexTokenId.equals(SSS_TOKEN_PROGRAM_ID)).to.be.true;
  });

  it("SSS_TRANSFER_HOOK_PROGRAM_ID is re-exported", () => {
    expect(IndexHookId.equals(SSS_TRANSFER_HOOK_PROGRAM_ID)).to.be.true;
  });

  it("CONFIG_SEED is re-exported", () => {
    expect(IndexConfigSeed.toString()).to.equal(CONFIG_SEED.toString());
  });
});
