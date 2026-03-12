# Constants Reference

All PDA seeds, max values, account sizes, error codes, and role types used across the SSS programs.

## PDA Seeds

| Account | Seeds | Program |
|---------|-------|---------|
| StablecoinConfig | `[b"config", mint]` | sss-token |
| RoleAssignment | `[b"role", config, role_type_u8, assignee]` | sss-token |
| ReserveAttestation | `[b"attestation", config]` | sss-token |
| RegistryEntry | `[b"registry", mint]` | sss-token |
| BlacklistEntry | `[b"blacklist", mint, user]` | sss-transfer-hook |
| ExtraAccountMetas | `[b"extra-account-metas", mint]` | sss-transfer-hook |

## Max Lengths

| Field | Max Length | Error If Exceeded |
|-------|-----------|-------------------|
| Token name | 32 bytes | `NameTooLong` (6015) |
| Token symbol | 10 bytes | `SymbolTooLong` (6016) |
| Metadata URI | 200 bytes | `UriTooLong` (6017) |
| Blacklist reason | 64 bytes | `ReasonTooLong` (6024) |
| Attestation URI | 256 bytes | `AttestationUriTooLong` (6030) |

## Account Sizes (bytes)

| Account | Size | Breakdown |
|---------|------|-----------|
| StablecoinConfig | 217 | 8 disc + 32 authority + 32 pending_authority + 8 transfer_initiated_at + 32 mint + 32 hook_program_id + 6 flags/bump + 32 treasury + 1 paused_by_attestation + 31 reserved + 3 padding |
| RoleAssignment | 155 | 8 disc + 32 config + 32 assignee + 1 role_type + 1 is_active + 8 minter_quota + 8 minted_amount + 1 bump + 64 reserved |
| ReserveAttestation | 398 | 8 disc + 32 config + 32 attestor + 8 reserve_amount + 8 token_supply + 8 timestamp + 8 expires_at + (4 + 256) attestation_uri + 1 is_valid + 1 bump + 32 reserved |
| RegistryEntry | 165 | 8 disc + 32 mint + 32 issuer + 1 compliance_level + 8 created_at + (4 + 32) name + (4 + 10) symbol + 1 decimals + 1 bump + 32 reserved |
| BlacklistEntry | 141 | 8 disc + 32 mint + 32 user + 1 bump + (4 + 64) reason |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `Unauthorized` | Signer is not the authority |
| 6001 | `InvalidRoleType` | Invalid role type value |
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
| 6014 | `InvalidDecimals` | Decimals must be 0-18 |
| 6015 | `NameTooLong` | Name exceeds 32 bytes |
| 6016 | `SymbolTooLong` | Symbol exceeds 10 bytes |
| 6017 | `UriTooLong` | URI exceeds 200 bytes |
| 6018 | `AccountBlacklisted` | Account is blacklisted |
| 6019 | `AccountNotBlacklisted` | Account is not blacklisted |
| 6020 | `InvalidHookProgram` | Invalid hook program |
| 6021 | `ZeroAmount` | Mint amount must be > 0 |
| 6022 | `ComplianceNotEnabled` | Compliance module not enabled |
| 6023 | `PermanentDelegateNotEnabled` | Permanent delegate not enabled |
| 6024 | `ReasonTooLong` | Blacklist reason exceeds 64 bytes |
| 6025 | `InvalidTreasury` | Seized tokens must go to treasury |
| 6026 | `TargetNotBlacklisted` | Target account owner not blacklisted |
| 6027 | `AccountDeliberatelyFrozen` | Cannot auto-thaw deliberately frozen account |
| 6028 | `InvalidBlacklistEntry` | Invalid blacklist entry PDA |
| 6029 | `InvalidFromOwner` | Invalid from account owner |
| 6030 | `AttestationUriTooLong` | Attestation URI exceeds 256 bytes |
| 6031 | `InvalidExpiration` | Expiration must be positive |
| 6032 | `Undercollateralized` | Reserves below token supply (auto-pauses) |
| 6033 | `CannotFreezeTreasury` | Cannot freeze the treasury account |
| 6034 | `InvalidTokenProgram` | Must be Token-2022 |

## Role Types

| Value | Role | Purpose |
|-------|------|---------|
| 0 | Minter | Can mint tokens up to assigned quota |
| 1 | Burner | Can burn tokens from any account |
| 2 | Pauser | Can pause/unpause all token operations |
| 3 | Freezer | Can freeze/thaw individual token accounts |
| 4 | Blacklister | Can add/remove addresses from blacklist |
| 5 | Seizer | Can seize tokens from blacklisted accounts |
| 6 | Attestor | Can submit reserve attestations |

## CPI Discriminators

| Instruction | Discriminator (hex) | Used By |
|-------------|---------------------|---------|
| `hook::add_to_blacklist` | `5a7362e7ad7775b0` | sss-token CPI into hook |
| `hook::remove_from_blacklist` | `2f69140aa5a8cbdb` | sss-token CPI into hook |
