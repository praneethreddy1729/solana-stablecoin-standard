export interface SSSErrorInfo {
  code: number;
  name: string;
  msg: string;
}

export const SSS_TOKEN_ERRORS: Record<number, SSSErrorInfo> = {
  6000: { code: 6000, name: "Unauthorized", msg: "Unauthorized: signer is not the authority" },
  6001: { code: 6001, name: "InvalidRoleType", msg: "Invalid role type" },
  6002: { code: 6002, name: "RoleNotActive", msg: "Role is not active" },
  6003: { code: 6003, name: "TokenPaused", msg: "Token is paused" },
  6004: { code: 6004, name: "TokenNotPaused", msg: "Token is not paused" },
  6005: { code: 6005, name: "MinterQuotaExceeded", msg: "Minter quota exceeded" },
  6006: { code: 6006, name: "InvalidMint", msg: "Invalid mint" },
  6007: { code: 6007, name: "InvalidConfig", msg: "Invalid config" },
  6008: { code: 6008, name: "AuthorityTransferNotPending", msg: "Authority transfer not pending" },
  6009: { code: 6009, name: "AuthorityTransferAlreadyPending", msg: "Authority transfer already pending" },
  6010: { code: 6010, name: "InvalidPendingAuthority", msg: "Invalid pending authority" },
  6011: { code: 6011, name: "AccountAlreadyFrozen", msg: "Account is already frozen" },
  6012: { code: 6012, name: "AccountNotFrozen", msg: "Account is not frozen" },
  6013: { code: 6013, name: "ArithmeticOverflow", msg: "Arithmetic overflow" },
  6014: { code: 6014, name: "InvalidDecimals", msg: "Invalid decimals: must be between 0 and 18" },
  6015: { code: 6015, name: "NameTooLong", msg: "Name too long" },
  6016: { code: 6016, name: "SymbolTooLong", msg: "Symbol too long" },
  6017: { code: 6017, name: "UriTooLong", msg: "URI too long" },
  6018: { code: 6018, name: "AccountBlacklisted", msg: "Account is blacklisted" },
  6019: { code: 6019, name: "AccountNotBlacklisted", msg: "Account is not blacklisted" },
  6020: { code: 6020, name: "InvalidHookProgram", msg: "Invalid hook program" },
  6021: { code: 6021, name: "ZeroAmount", msg: "Mint amount must be greater than zero" },
  6022: { code: 6022, name: "ComplianceNotEnabled", msg: "Compliance module not enabled for this token" },
  6023: { code: 6023, name: "PermanentDelegateNotEnabled", msg: "Permanent delegate not enabled for this token" },
  6024: { code: 6024, name: "ReasonTooLong", msg: "Blacklist reason too long (max 64 bytes)" },
  6025: { code: 6025, name: "InvalidTreasury", msg: "Seized tokens must go to the designated treasury" },
  6026: { code: 6026, name: "TargetNotBlacklisted", msg: "Target account owner is not blacklisted" },
  6027: { code: 6027, name: "AccountDeliberatelyFrozen", msg: "Account is deliberately frozen and cannot be auto-thawed" },
  6028: { code: 6028, name: "InvalidBlacklistEntry", msg: "Invalid blacklist entry PDA" },
  6029: { code: 6029, name: "InvalidFromOwner", msg: "Invalid from account owner" },
  6030: { code: 6030, name: "AttestationUriTooLong", msg: "Attestation URI too long (max 256 bytes)" },
  6031: { code: 6031, name: "InvalidExpiration", msg: "Expiration must be positive" },
  6032: { code: 6032, name: "Undercollateralized", msg: "Reserves less than supply; token auto-paused" },
  6033: { code: 6033, name: "CannotFreezeTreasury", msg: "Cannot freeze the treasury account" },
  6034: { code: 6034, name: "InvalidTokenProgram", msg: "Invalid token program: must be Token-2022" },
};

export const SSS_TRANSFER_HOOK_ERRORS: Record<number, SSSErrorInfo> = {
  6000: { code: 6000, name: "SenderBlacklisted", msg: "Sender is blacklisted" },
  6001: { code: 6001, name: "ReceiverBlacklisted", msg: "Receiver is blacklisted" },
  6002: { code: 6002, name: "TokenPaused", msg: "Token is paused" },
  6003: { code: 6003, name: "InvalidBlacklistEntry", msg: "Invalid blacklist entry" },
  6004: { code: 6004, name: "AlreadyBlacklisted", msg: "Already blacklisted" },
  6005: { code: 6005, name: "NotBlacklisted", msg: "Not blacklisted" },
  6006: { code: 6006, name: "Unauthorized", msg: "Unauthorized" },
};

/** Parse an Anchor program error into an SSSErrorInfo, or null if unrecognized. */
export function parseSSSError(error: unknown): SSSErrorInfo | null {
  const code = extractErrorCode(error);
  if (code === null) return null;

  if (SSS_TOKEN_ERRORS[code]) return SSS_TOKEN_ERRORS[code];
  if (SSS_TRANSFER_HOOK_ERRORS[code]) return SSS_TRANSFER_HOOK_ERRORS[code];

  return null;
}

function extractErrorCode(error: unknown): number | null {
  if (error == null || typeof error !== "object") return null;

  const e = error as Record<string, unknown>;

  // Anchor ProgramError shape: { code: number }
  if (typeof e.code === "number") return e.code;

  // AnchorError shape: { error: { errorCode: { number: N } } }
  if (e.error && typeof e.error === "object") {
    const inner = e.error as Record<string, unknown>;
    if (inner.errorCode && typeof inner.errorCode === "object" && inner.errorCode !== null) {
      const ec = inner.errorCode as Record<string, unknown>;
      if (typeof ec.number === "number") return ec.number;
    }
  }

  // Error message pattern: "Error Number: 6xxx"
  if (typeof e.message === "string") {
    const match = e.message.match(/Error Number:\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  // Logs array pattern
  if (Array.isArray(e.logs)) {
    for (const log of e.logs) {
      if (typeof log === "string") {
        const match = log.match(/Error Number:\s*(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    }
  }

  return null;
}
