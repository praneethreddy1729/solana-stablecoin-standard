import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  findConfigPda,
  findRolePda,
  findBlacklistPda,
  findExtraAccountMetasPda,
  findAttestationPda,
  findRegistryEntryPda,
} from "../src/pda";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ATTESTATION_SEED,
  REGISTRY_SEED,
} from "../src/constants";
import { RoleType } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deterministicKeypair(seed: number): Keypair {
  const bytes = new Uint8Array(32);
  bytes[0] = seed;
  return Keypair.fromSeed(bytes);
}

const MINT = deterministicKeypair(1).publicKey;
const MINT2 = deterministicKeypair(10).publicKey;
const USER = deterministicKeypair(2).publicKey;
const ASSIGNEE = deterministicKeypair(3).publicKey;
const OTHER_PROGRAM = deterministicKeypair(99).publicKey;

// ---------------------------------------------------------------------------
// 1. findConfigPda
// ---------------------------------------------------------------------------

describe("findConfigPda", () => {
  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findConfigPda(MINT);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("is deterministic — same inputs produce same output", () => {
    const [a] = findConfigPda(MINT);
    const [b] = findConfigPda(MINT);
    expect(a.equals(b)).to.be.true;
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findConfigPda(MINT);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("differs for different mints", () => {
    const [a] = findConfigPda(MINT);
    const [b] = findConfigPda(MINT2);
    expect(a.equals(b)).to.be.false;
  });

  it("defaults to SSS_TOKEN_PROGRAM_ID", () => {
    const [a] = findConfigPda(MINT);
    const [b] = findConfigPda(MINT, SSS_TOKEN_PROGRAM_ID);
    expect(a.equals(b)).to.be.true;
  });

  it("produces different PDA with different programId", () => {
    const [a] = findConfigPda(MINT);
    const [b] = findConfigPda(MINT, OTHER_PROGRAM);
    expect(a.equals(b)).to.be.false;
  });

  it("matches manual PublicKey.findProgramAddressSync", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED, MINT.toBuffer()],
      SSS_TOKEN_PROGRAM_ID
    );
    const [actual, actualBump] = findConfigPda(MINT);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 2. findRolePda
// ---------------------------------------------------------------------------

describe("findRolePda", () => {
  let configPda: PublicKey;

  beforeAll(() => {
    [configPda] = findConfigPda(MINT);
  });

  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("is deterministic", () => {
    const [a] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    const [b] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    expect(a.equals(b)).to.be.true;
  });

  it("different role types produce different PDAs", () => {
    const allRoles = [
      RoleType.Minter,
      RoleType.Burner,
      RoleType.Pauser,
      RoleType.Freezer,
      RoleType.Blacklister,
      RoleType.Seizer,
      RoleType.Attestor,
    ];
    const pdas = allRoles.map(
      (rt) => findRolePda(configPda, rt, ASSIGNEE)[0].toBase58()
    );
    expect(new Set(pdas).size).to.equal(7);
  });

  it("different assignees produce different PDAs", () => {
    const [a] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    const [b] = findRolePda(configPda, RoleType.Minter, USER);
    expect(a.equals(b)).to.be.false;
  });

  it("matches manual derivation", () => {
    const rt = RoleType.Freezer;
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, configPda.toBuffer(), Buffer.from([rt]), ASSIGNEE.toBuffer()],
      SSS_TOKEN_PROGRAM_ID
    );
    const [actual, actualBump] = findRolePda(configPda, rt, ASSIGNEE);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 3. findBlacklistPda
// ---------------------------------------------------------------------------

describe("findBlacklistPda", () => {
  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findBlacklistPda(MINT, USER);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findBlacklistPda(MINT, USER);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("is deterministic", () => {
    const [a] = findBlacklistPda(MINT, USER);
    const [b] = findBlacklistPda(MINT, USER);
    expect(a.equals(b)).to.be.true;
  });

  it("uses SSS_TRANSFER_HOOK_PROGRAM_ID by default", () => {
    const [a] = findBlacklistPda(MINT, USER);
    const [b] = findBlacklistPda(MINT, USER, SSS_TRANSFER_HOOK_PROGRAM_ID);
    expect(a.equals(b)).to.be.true;
  });

  it("differs for different users", () => {
    const [a] = findBlacklistPda(MINT, USER);
    const [b] = findBlacklistPda(MINT, ASSIGNEE);
    expect(a.equals(b)).to.be.false;
  });

  it("matches manual derivation", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [BLACKLIST_SEED, MINT.toBuffer(), USER.toBuffer()],
      SSS_TRANSFER_HOOK_PROGRAM_ID
    );
    const [actual, actualBump] = findBlacklistPda(MINT, USER);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 4. findExtraAccountMetasPda
// ---------------------------------------------------------------------------

describe("findExtraAccountMetasPda", () => {
  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findExtraAccountMetasPda(MINT);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findExtraAccountMetasPda(MINT);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("is deterministic", () => {
    const [a] = findExtraAccountMetasPda(MINT);
    const [b] = findExtraAccountMetasPda(MINT);
    expect(a.equals(b)).to.be.true;
  });

  it("uses SSS_TRANSFER_HOOK_PROGRAM_ID by default", () => {
    const [a] = findExtraAccountMetasPda(MINT);
    const [b] = findExtraAccountMetasPda(MINT, SSS_TRANSFER_HOOK_PROGRAM_ID);
    expect(a.equals(b)).to.be.true;
  });

  it("matches manual derivation", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [EXTRA_ACCOUNT_METAS_SEED, MINT.toBuffer()],
      SSS_TRANSFER_HOOK_PROGRAM_ID
    );
    const [actual, actualBump] = findExtraAccountMetasPda(MINT);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 5. findAttestationPda
// ---------------------------------------------------------------------------

describe("findAttestationPda", () => {
  let configPda: PublicKey;

  beforeAll(() => {
    [configPda] = findConfigPda(MINT);
  });

  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findAttestationPda(configPda);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findAttestationPda(configPda);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("is deterministic", () => {
    const [a] = findAttestationPda(configPda);
    const [b] = findAttestationPda(configPda);
    expect(a.equals(b)).to.be.true;
  });

  it("defaults to SSS_TOKEN_PROGRAM_ID", () => {
    const [a] = findAttestationPda(configPda);
    const [b] = findAttestationPda(configPda, SSS_TOKEN_PROGRAM_ID);
    expect(a.equals(b)).to.be.true;
  });

  it("matches manual derivation", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [ATTESTATION_SEED, configPda.toBuffer()],
      SSS_TOKEN_PROGRAM_ID
    );
    const [actual, actualBump] = findAttestationPda(configPda);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 6. findRegistryEntryPda
// ---------------------------------------------------------------------------

describe("findRegistryEntryPda", () => {
  it("returns a [PublicKey, number] tuple", () => {
    const [pda, bump] = findRegistryEntryPda(MINT);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
  });

  it("bump is between 0 and 255", () => {
    const [, bump] = findRegistryEntryPda(MINT);
    expect(bump).to.be.gte(0).and.lte(255);
  });

  it("is deterministic", () => {
    const [a] = findRegistryEntryPda(MINT);
    const [b] = findRegistryEntryPda(MINT);
    expect(a.equals(b)).to.be.true;
  });

  it("differs for different mints", () => {
    const [a] = findRegistryEntryPda(MINT);
    const [b] = findRegistryEntryPda(MINT2);
    expect(a.equals(b)).to.be.false;
  });

  it("matches manual derivation", () => {
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [REGISTRY_SEED, MINT.toBuffer()],
      SSS_TOKEN_PROGRAM_ID
    );
    const [actual, actualBump] = findRegistryEntryPda(MINT);
    expect(actual.equals(expected)).to.be.true;
    expect(actualBump).to.equal(expectedBump);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-seed uniqueness
// ---------------------------------------------------------------------------

describe("Cross-PDA uniqueness", () => {
  it("no collisions between config, blacklist, extraMetas, attestation, and registry for same mint", () => {
    const [configPda] = findConfigPda(MINT);
    const [blacklistPda] = findBlacklistPda(MINT, USER);
    const [extraMetasPda] = findExtraAccountMetasPda(MINT);
    const [attestationPda] = findAttestationPda(configPda);
    const [registryPda] = findRegistryEntryPda(MINT);

    const all = [configPda, blacklistPda, extraMetasPda, attestationPda, registryPda].map(
      (pk) => pk.toBase58()
    );
    expect(new Set(all).size).to.equal(5);
  });

  it("no collisions between role PDAs and other PDA types", () => {
    const [configPda] = findConfigPda(MINT);
    const [rolePda] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
    const [blacklistPda] = findBlacklistPda(MINT, USER);
    const [registryPda] = findRegistryEntryPda(MINT);

    const all = [configPda, rolePda, blacklistPda, registryPda].map(
      (pk) => pk.toBase58()
    );
    expect(new Set(all).size).to.equal(4);
  });
});
