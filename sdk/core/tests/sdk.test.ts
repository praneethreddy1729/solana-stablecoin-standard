import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  findConfigPda,
  findRolePda,
  findBlacklistPda,
  findExtraAccountMetasPda,
} from "../src/pda";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
} from "../src/constants";
import { RoleType, Preset } from "../src/types";
import {
  SSS_TOKEN_ERRORS,
  SSS_TRANSFER_HOOK_ERRORS,
  parseSSSError,
} from "../src/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic keypair from a fixed seed for reproducible tests */
function deterministicKeypair(seed: number): Keypair {
  const bytes = new Uint8Array(32);
  bytes[0] = seed;
  return Keypair.fromSeed(bytes);
}

const MINT = deterministicKeypair(1).publicKey;
const USER = deterministicKeypair(2).publicKey;
const ASSIGNEE = deterministicKeypair(3).publicKey;

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

describe("Constants", () => {
  it("SSS_TOKEN_PROGRAM_ID is a valid PublicKey matching expected base58", () => {
    expect(SSS_TOKEN_PROGRAM_ID).to.be.instanceOf(PublicKey);
    expect(SSS_TOKEN_PROGRAM_ID.toBase58()).to.equal(
      "tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz"
    );
  });

  it("SSS_TRANSFER_HOOK_PROGRAM_ID is a valid PublicKey matching expected base58", () => {
    expect(SSS_TRANSFER_HOOK_PROGRAM_ID).to.be.instanceOf(PublicKey);
    expect(SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58()).to.equal(
      "A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB"
    );
  });

  it("PDA seed buffers match expected strings", () => {
    expect(CONFIG_SEED.toString()).to.equal("config");
    expect(ROLE_SEED.toString()).to.equal("role");
    expect(BLACKLIST_SEED.toString()).to.equal("blacklist");
    expect(EXTRA_ACCOUNT_METAS_SEED.toString()).to.equal("extra-account-metas");
  });
});

// ---------------------------------------------------------------------------
// 2. RoleType & Preset enums
// ---------------------------------------------------------------------------

describe("RoleType enum", () => {
  it("Minter = 0", () => { expect(RoleType.Minter).to.equal(0); });
  it("Burner = 1", () => { expect(RoleType.Burner).to.equal(1); });
  it("Pauser = 2", () => { expect(RoleType.Pauser).to.equal(2); });
  it("Freezer = 3", () => { expect(RoleType.Freezer).to.equal(3); });
  it("Blacklister = 4", () => { expect(RoleType.Blacklister).to.equal(4); });
  it("Seizer = 5", () => { expect(RoleType.Seizer).to.equal(5); });
  it("Attestor = 6", () => { expect(RoleType.Attestor).to.equal(6); });

  it("has exactly 7 members", () => {
    // numeric enums produce both name->value and value->name mappings
    const values = Object.values(RoleType).filter(
      (v) => typeof v === "number"
    );
    expect(values).to.have.lengthOf(7);
  });
});

describe("Preset enum", () => {
  it("SSS_1 = 'SSS_1'", () => { expect(Preset.SSS_1).to.equal("SSS_1"); });
  it("SSS_2 = 'SSS_2'", () => { expect(Preset.SSS_2).to.equal("SSS_2"); });
  it("Custom = 'Custom'", () => { expect(Preset.Custom).to.equal("Custom"); });
});

// ---------------------------------------------------------------------------
// 3. PDA derivation
// ---------------------------------------------------------------------------

describe("PDA derivation", () => {
  describe("findConfigPda", () => {
    it("returns a tuple of [PublicKey, number]", () => {
      const [pda, bump] = findConfigPda(MINT);
      expect(pda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.a("number");
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it("is deterministic (same inputs produce same output)", () => {
      const [a] = findConfigPda(MINT);
      const [b] = findConfigPda(MINT);
      expect(a.equals(b)).to.be.true;
    });

    it("differs for different mints", () => {
      const [a] = findConfigPda(MINT);
      const [b] = findConfigPda(USER);
      expect(a.equals(b)).to.be.false;
    });

    it("uses SSS_TOKEN_PROGRAM_ID as default programId", () => {
      const [defaultPda] = findConfigPda(MINT);
      const [explicitPda] = findConfigPda(MINT, SSS_TOKEN_PROGRAM_ID);
      expect(defaultPda.equals(explicitPda)).to.be.true;
    });

    it("produces different PDA with different programId", () => {
      const otherProgram = Keypair.generate().publicKey;
      const [defaultPda] = findConfigPda(MINT);
      const [otherPda] = findConfigPda(MINT, otherProgram);
      expect(defaultPda.equals(otherPda)).to.be.false;
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

  describe("findRolePda", () => {
    let configPda: PublicKey;

    beforeAll(() => {
      [configPda] = findConfigPda(MINT);
    });

    it("returns [PublicKey, number] with valid bump", () => {
      const [pda, bump] = findRolePda(
        configPda,
        RoleType.Minter,
        ASSIGNEE
      );
      expect(pda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it("is deterministic", () => {
      const [a] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
      const [b] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
      expect(a.equals(b)).to.be.true;
    });

    it("differs across role types", () => {
      const pdas = [
        RoleType.Minter,
        RoleType.Burner,
        RoleType.Pauser,
        RoleType.Freezer,
        RoleType.Blacklister,
        RoleType.Seizer,
        RoleType.Attestor,
      ].map((rt) => findRolePda(configPda, rt, ASSIGNEE)[0].toBase58());

      // all unique
      expect(new Set(pdas).size).to.equal(7);
    });

    it("differs for different assignees", () => {
      const [a] = findRolePda(configPda, RoleType.Minter, ASSIGNEE);
      const [b] = findRolePda(configPda, RoleType.Minter, USER);
      expect(a.equals(b)).to.be.false;
    });

    it("matches manual derivation", () => {
      const roleType = RoleType.Burner;
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [
          ROLE_SEED,
          configPda.toBuffer(),
          Buffer.from([roleType]),
          ASSIGNEE.toBuffer(),
        ],
        SSS_TOKEN_PROGRAM_ID
      );
      const [actual, actualBump] = findRolePda(
        configPda,
        roleType,
        ASSIGNEE
      );
      expect(actual.equals(expected)).to.be.true;
      expect(actualBump).to.equal(expectedBump);
    });
  });

  describe("findBlacklistPda", () => {
    it("returns [PublicKey, number] with valid bump", () => {
      const [pda, bump] = findBlacklistPda(MINT, USER);
      expect(pda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it("is deterministic", () => {
      const [a] = findBlacklistPda(MINT, USER);
      const [b] = findBlacklistPda(MINT, USER);
      expect(a.equals(b)).to.be.true;
    });

    it("differs for different users", () => {
      const [a] = findBlacklistPda(MINT, USER);
      const [b] = findBlacklistPda(MINT, ASSIGNEE);
      expect(a.equals(b)).to.be.false;
    });

    it("differs for different mints", () => {
      const [a] = findBlacklistPda(MINT, USER);
      const [b] = findBlacklistPda(ASSIGNEE, USER);
      expect(a.equals(b)).to.be.false;
    });

    it("uses SSS_TRANSFER_HOOK_PROGRAM_ID as default", () => {
      const [defaultPda] = findBlacklistPda(MINT, USER);
      const [explicitPda] = findBlacklistPda(
        MINT,
        USER,
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );
      expect(defaultPda.equals(explicitPda)).to.be.true;
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

  describe("findExtraAccountMetasPda", () => {
    it("returns [PublicKey, number] with valid bump", () => {
      const [pda, bump] = findExtraAccountMetasPda(MINT);
      expect(pda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it("is deterministic", () => {
      const [a] = findExtraAccountMetasPda(MINT);
      const [b] = findExtraAccountMetasPda(MINT);
      expect(a.equals(b)).to.be.true;
    });

    it("differs for different mints", () => {
      const [a] = findExtraAccountMetasPda(MINT);
      const [b] = findExtraAccountMetasPda(USER);
      expect(a.equals(b)).to.be.false;
    });

    it("uses SSS_TRANSFER_HOOK_PROGRAM_ID as default", () => {
      const [defaultPda] = findExtraAccountMetasPda(MINT);
      const [explicitPda] = findExtraAccountMetasPda(
        MINT,
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );
      expect(defaultPda.equals(explicitPda)).to.be.true;
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
});

// ---------------------------------------------------------------------------
// 4. Error maps & parseSSSError
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  describe("SSS_TOKEN_ERRORS", () => {
    it("has entries for codes 6000-6023", () => {
      for (let code = 6000; code <= 6023; code++) {
        expect(SSS_TOKEN_ERRORS[code], `missing error code ${code}`).to.exist;
        expect(SSS_TOKEN_ERRORS[code].code).to.equal(code);
        expect(SSS_TOKEN_ERRORS[code].name).to.be.a("string").and.not.empty;
        expect(SSS_TOKEN_ERRORS[code].msg).to.be.a("string").and.not.empty;
      }
    });

    it("first error is Unauthorized", () => {
      expect(SSS_TOKEN_ERRORS[6000].name).to.equal("Unauthorized");
    });

    it("last error is PermanentDelegateNotEnabled", () => {
      expect(SSS_TOKEN_ERRORS[6023].name).to.equal(
        "PermanentDelegateNotEnabled"
      );
    });
  });

  describe("SSS_TRANSFER_HOOK_ERRORS", () => {
    it("has entries for codes 6000-6006", () => {
      for (let code = 6000; code <= 6006; code++) {
        expect(
          SSS_TRANSFER_HOOK_ERRORS[code],
          `missing hook error code ${code}`
        ).to.exist;
        expect(SSS_TRANSFER_HOOK_ERRORS[code].code).to.equal(code);
      }
    });
  });

  describe("parseSSSError", () => {
    it("returns null for null/undefined", () => {
      expect(parseSSSError(null)).to.be.null;
      expect(parseSSSError(undefined)).to.be.null;
    });

    it("returns null for non-object", () => {
      expect(parseSSSError("string")).to.be.null;
      expect(parseSSSError(42)).to.be.null;
    });

    it("returns null for unknown error code", () => {
      expect(parseSSSError({ code: 9999 })).to.be.null;
    });

    it("parses Anchor ProgramError shape { code: number }", () => {
      const result = parseSSSError({ code: 6005 });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("MinterQuotaExceeded");
    });

    it("parses AnchorError shape { error: { errorCode: { number: N } } }", () => {
      const result = parseSSSError({
        error: { errorCode: { number: 6003 } },
      });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("TokenPaused");
    });

    it("parses error message with 'Error Number: XXXX'", () => {
      const result = parseSSSError({
        message: "Transaction failed: Error Number: 6006",
      });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("InvalidMint");
    });

    it("parses error from logs array", () => {
      const result = parseSSSError({
        logs: [
          "Program log: something",
          "Program log: Error Number: 6002",
        ],
      });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("RoleNotActive");
    });

    it("prefers token program errors over hook errors for same code", () => {
      // code 6000 exists in both maps; token program should take priority
      const result = parseSSSError({ code: 6000 });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("Unauthorized"); // token program's name
    });
  });
});
