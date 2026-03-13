# Error Codes

This document lists all custom error codes emitted by the SSS programs. Errors are returned as Anchor program errors. The numeric code is `6000 + variant_index`.

## sss-token Program Errors

Program ID: `tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz`

| Code | Variant | Message |
|:----:|---------|---------|
| 6000 | `Unauthorized` | Unauthorized: signer is not the authority |
| 6001 | `InvalidRoleType` | Invalid role type |
| 6002 | `RoleNotActive` | Role is not active |
| 6003 | `TokenPaused` | Token is paused |
| 6004 | `TokenNotPaused` | Token is not paused |
| 6005 | `MinterQuotaExceeded` | Minter quota exceeded |
| 6006 | `InvalidMint` | Invalid mint |
| 6007 | `InvalidConfig` | Invalid config |
| 6008 | `AuthorityTransferNotPending` | Authority transfer not pending |
| 6009 | `AuthorityTransferAlreadyPending` | Authority transfer already pending |
| 6010 | `InvalidPendingAuthority` | Invalid pending authority |
| 6011 | `AccountAlreadyFrozen` | Account is already frozen |
| 6012 | `AccountNotFrozen` | Account is not frozen |
| 6013 | `ArithmeticOverflow` | Arithmetic overflow |
| 6014 | `InvalidDecimals` | Invalid decimals: must be between 0 and 18 |
| 6015 | `NameTooLong` | Name too long |
| 6016 | `SymbolTooLong` | Symbol too long |
| 6017 | `UriTooLong` | URI too long |
| 6018 | `AccountBlacklisted` | Account is blacklisted |
| 6019 | `AccountNotBlacklisted` | Account is not blacklisted |
| 6020 | `InvalidHookProgram` | Invalid hook program |
| 6021 | `ZeroAmount` | Mint amount must be greater than zero |
| 6022 | `ComplianceNotEnabled` | Compliance module not enabled for this token |
| 6023 | `PermanentDelegateNotEnabled` | Permanent delegate not enabled for this token |
| 6024 | `ReasonTooLong` | Blacklist reason too long (max 64 bytes) |
| 6025 | `InvalidTreasury` | Seized tokens must go to the designated treasury |
| 6026 | `TargetNotBlacklisted` | Target account owner is not blacklisted |
| 6027 | `AccountDeliberatelyFrozen` | Account is deliberately frozen and cannot be auto-thawed |
| 6028 | `InvalidBlacklistEntry` | Invalid blacklist entry PDA |
| 6029 | `InvalidFromOwner` | Invalid from account owner |
| 6030 | `AttestationUriTooLong` | Attestation URI too long (max 256 bytes) |
| 6031 | `InvalidExpiration` | Invalid expiration: must be positive |
| 6032 | `Undercollateralized` | Undercollateralized: reserves are below token supply |
| 6033 | `CannotFreezeTreasury` | Cannot freeze the treasury account |
| 6034 | `InvalidTokenProgram` | Invalid token program: must be Token-2022 |

**Total: 35 error variants (6000–6034)**

---

## sss-transfer-hook Program Errors

Program ID: `A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB`

| Code | Variant | Message |
|:----:|---------|---------|
| 6000 | `SenderBlacklisted` | Sender is blacklisted |
| 6001 | `ReceiverBlacklisted` | Receiver is blacklisted |
| 6002 | `TokenPaused` | Token is paused |
| 6003 | `InvalidBlacklistEntry` | Invalid blacklist entry |
| 6004 | `AlreadyBlacklisted` | Already blacklisted |
| 6005 | `NotBlacklisted` | Not blacklisted |
| 6006 | `Unauthorized` | Unauthorized |
| 6007 | `TokenPausedByAttestation` | Token is paused by attestation — reserves are undercollateralized |

**Total: 8 error variants (6000–6007)**

---

## Parsing Errors in TypeScript

The SDK exports `parseSSSError` which decodes an Anchor/RPC error into a structured object:

```typescript
import { parseSSSError } from "@stbr/sss-token";

try {
  await stablecoin.mint(recipientAta, amount, minterPubkey);
} catch (err) {
  const parsed = parseSSSError(err);
  if (parsed) {
    console.error(`SSS Error ${parsed.code}: ${parsed.name} — ${parsed.msg}`);
    // e.g. "SSS Error 6005: MinterQuotaExceeded — Minter quota exceeded"
  }
}
```

---

## Error Categories

### Access Control (6000–6002, 6006 hook)
- `Unauthorized` — signer is not the authority
- `InvalidRoleType` — role enum value out of range
- `RoleNotActive` — role assignment exists but is disabled

### State Guards (6003–6004)
- `TokenPaused` — operation blocked because token is paused
- `TokenNotPaused` — `unpause` called when token is not paused

### Quota and Arithmetic (6005, 6013)
- `MinterQuotaExceeded` — minting would exceed the cumulative quota
- `ArithmeticOverflow` — checked arithmetic overflowed

### Account Validation (6006–6007, 6011–6012, 6028–6029, 6034)
- `InvalidMint` — mint account does not match config
- `InvalidConfig` — config PDA derivation mismatch
- `AccountAlreadyFrozen` — freeze called on already-frozen account
- `AccountNotFrozen` — thaw called on non-frozen account
- `InvalidBlacklistEntry` — blacklist PDA seeds mismatch
- `InvalidFromOwner` — token account owner mismatch on burn
- `InvalidTokenProgram` — must use Token-2022 program

### Authority Transfer (6008–6010)
- `AuthorityTransferNotPending` — accept/cancel called with no pending transfer
- `AuthorityTransferAlreadyPending` — transfer proposed when one already exists
- `InvalidPendingAuthority` — accept called by wrong signer

### Input Validation (6014–6017, 6021, 6024, 6030–6031)
- `InvalidDecimals` — decimals must be 0–18
- `NameTooLong` — token name exceeds max length
- `SymbolTooLong` — token symbol exceeds max length
- `UriTooLong` — metadata URI exceeds max length
- `ZeroAmount` — mint amount must be > 0
- `ReasonTooLong` — blacklist reason exceeds 64 bytes
- `AttestationUriTooLong` — attestation URI exceeds 256 bytes
- `InvalidExpiration` — expiration must be positive

### SSS-2 Compliance (6018–6020, 6022–6023, 6025–6027, 6033)
- `AccountBlacklisted` — operation on a blacklisted account
- `AccountNotBlacklisted` — blacklist operation on non-blacklisted account
- `InvalidHookProgram` — hook program ID mismatch
- `ComplianceNotEnabled` — SSS-2 instruction called on SSS-1 token
- `PermanentDelegateNotEnabled` — seize called on token without permanent delegate
- `InvalidTreasury` — seized tokens must go to designated treasury
- `TargetNotBlacklisted` — seize target's owner wallet is not blacklisted
- `AccountDeliberatelyFrozen` — auto-thaw blocked; account was manually frozen
- `CannotFreezeTreasury` — freeze rejected for treasury account

### Reserve Attestation (6032)
- `Undercollateralized` — reserves < supply; auto-pause triggered
