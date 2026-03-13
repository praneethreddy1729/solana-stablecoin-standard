import { expect } from "chai";
import {
  SSS_TOKEN_ERRORS,
  SSS_TRANSFER_HOOK_ERRORS,
  parseSSSError,
  SSSErrorInfo,
} from "../src/errors";

// ---------------------------------------------------------------------------
// 1. SSS_TOKEN_ERRORS map
// ---------------------------------------------------------------------------

describe("SSS_TOKEN_ERRORS", () => {
  it("has entries for codes 6000-6034", () => {
    for (let code = 6000; code <= 6034; code++) {
      expect(SSS_TOKEN_ERRORS[code], `missing error code ${code}`).to.exist;
    }
  });

  it("every entry has code, name, and msg fields", () => {
    for (const entry of Object.values(SSS_TOKEN_ERRORS)) {
      expect(entry.code).to.be.a("number");
      expect(entry.name).to.be.a("string").and.not.empty;
      expect(entry.msg).to.be.a("string").and.not.empty;
    }
  });

  it("entry code matches its map key", () => {
    for (const [key, entry] of Object.entries(SSS_TOKEN_ERRORS)) {
      expect(entry.code).to.equal(Number(key));
    }
  });

  it("all error names are unique", () => {
    const names = Object.values(SSS_TOKEN_ERRORS).map((e) => e.name);
    expect(new Set(names).size).to.equal(names.length);
  });

  it("first error is Unauthorized (6000)", () => {
    expect(SSS_TOKEN_ERRORS[6000].name).to.equal("Unauthorized");
  });

  it("last error is InvalidTokenProgram (6034)", () => {
    expect(SSS_TOKEN_ERRORS[6034].name).to.equal("InvalidTokenProgram");
  });
});

// ---------------------------------------------------------------------------
// 2. SSS_TRANSFER_HOOK_ERRORS map
// ---------------------------------------------------------------------------

describe("SSS_TRANSFER_HOOK_ERRORS", () => {
  it("has entries for codes 6000-6007", () => {
    for (let code = 6000; code <= 6007; code++) {
      expect(SSS_TRANSFER_HOOK_ERRORS[code], `missing hook error code ${code}`).to.exist;
    }
  });

  it("every entry has code, name, and msg fields", () => {
    for (const entry of Object.values(SSS_TRANSFER_HOOK_ERRORS)) {
      expect(entry.code).to.be.a("number");
      expect(entry.name).to.be.a("string").and.not.empty;
      expect(entry.msg).to.be.a("string").and.not.empty;
    }
  });

  it("entry code matches its map key", () => {
    for (const [key, entry] of Object.entries(SSS_TRANSFER_HOOK_ERRORS)) {
      expect(entry.code).to.equal(Number(key));
    }
  });

  it("all hook error names are unique", () => {
    const names = Object.values(SSS_TRANSFER_HOOK_ERRORS).map((e) => e.name);
    expect(new Set(names).size).to.equal(names.length);
  });
});

// ---------------------------------------------------------------------------
// 3. parseSSSError
// ---------------------------------------------------------------------------

describe("parseSSSError", () => {
  it("returns null for null", () => {
    expect(parseSSSError(null)).to.be.null;
  });

  it("returns null for undefined", () => {
    expect(parseSSSError(undefined)).to.be.null;
  });

  it("returns null for a string", () => {
    expect(parseSSSError("some error")).to.be.null;
  });

  it("returns null for a number", () => {
    expect(parseSSSError(42)).to.be.null;
  });

  it("returns null for a boolean", () => {
    expect(parseSSSError(true)).to.be.null;
  });

  it("returns null for an empty object", () => {
    expect(parseSSSError({})).to.be.null;
  });

  it("returns null for an unknown error code", () => {
    expect(parseSSSError({ code: 9999 })).to.be.null;
  });

  it("returns null for a code below 6000", () => {
    expect(parseSSSError({ code: 5999 })).to.be.null;
  });

  it("parses Anchor ProgramError shape { code: number }", () => {
    const result = parseSSSError({ code: 6005 });
    expect(result).to.not.be.null;
    expect(result!.name).to.equal("MinterQuotaExceeded");
    expect(result!.code).to.equal(6005);
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
    const result = parseSSSError({ code: 6000 });
    expect(result).to.not.be.null;
    expect(result!.name).to.equal("Unauthorized");
  });

  it("parsed result includes msg field", () => {
    const result = parseSSSError({ code: 6021 });
    expect(result).to.not.be.null;
    expect(result!.msg).to.include("greater than zero");
  });

  it("returns null for object with non-numeric code", () => {
    expect(parseSSSError({ code: "6000" })).to.be.null;
  });

  it("returns null for logs with no matching pattern", () => {
    expect(
      parseSSSError({
        logs: ["Program log: success", "Program log: done"],
      })
    ).to.be.null;
  });
});
