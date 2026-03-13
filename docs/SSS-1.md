# SSS-1: Basic Stablecoin Specification

## Overview

SSS-1 defines the minimum feature set for a regulated stablecoin on Solana. It provides mint/burn lifecycle, account freezing, global pause, role-based access control, and two-step authority transfer -- all without requiring a transfer hook or compliance module.

An SSS-1 token uses Token-2022 with the **MetadataPointer** extension only (no TransferHook, no PermanentDelegate, no DefaultAccountState).

## Initialization

Create an SSS-1 stablecoin by calling `initialize` with compliance flags set to `false`:

```rust
InitializeArgs {
    name: "USD Coin",
    symbol: "USDC",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    enable_transfer_hook: false,
    enable_permanent_delegate: false,
    default_account_frozen: false,
}
```

This creates:
1. A Token-2022 mint with MetadataPointer extension
2. A StablecoinConfig PDA storing all configuration
3. The Config PDA is set as both mint authority and freeze authority

### Extension Init Order (SSS-1)

Since only MetadataPointer is enabled:
1. `createAccount` (allocate space for extensions)
2. `initializeMetadataPointer` (mint points to itself, config as update authority)
3. `initializeMint2` (config PDA as mint + freeze authority)
4. `initializeTokenMetadata` (name, symbol, uri -- signed by config PDA)

### Validation Rules
- `decimals` must be 0-18
- `name` max 32 characters
- `symbol` max 10 characters
- `uri` max 200 characters

## Token Operations

### Mint

**Instruction**: `mint(amount: u64)`
**Required Role**: Minter
**Checks**: Amount > 0, not paused, role active, `checked_add` quota check

The minter must have an active `RoleAssignment` with `role_type = 0` (Minter). Each mint operation increments `minted_amount` on the role PDA using `checked_add` to prevent overflow. If `minted_amount + amount > minter_quota`, the transaction fails with `MinterQuotaExceeded`.

If `default_account_frozen` is enabled (SSS-2), the mint instruction automatically thaws the recipient account before minting.

### Burn

**Instruction**: `burn(amount: u64)`
**Required Role**: Burner
**Checks**: Amount > 0, not paused, role active

Burns tokens from a token account. The `from_authority` (owner of the token account) must co-sign the transaction alongside the burner. This ensures tokens cannot be burned without the holder's consent. The burn uses the `from_authority` signer directly (not the Config PDA).

### Freeze

**Instruction**: `freeze_account`
**Required Role**: Freezer
**Checks**: Role active, account not already frozen (AccountAlreadyFrozen)

Freezes a token account, preventing all transfers in and out. The Config PDA signs as freeze authority.

### Thaw

**Instruction**: `thaw_account`
**Required Role**: Freezer
**Checks**: Role active, account is currently frozen (AccountNotFrozen)

Unfreezes a previously frozen token account.

### Pause

**Instruction**: `pause`
**Required Role**: Pauser
**Checks**: Role active, token not already paused (TokenNotPaused)

Sets `config.paused = true`. While paused, `mint` and `burn` will fail with `TokenPaused`. For SSS-2 tokens, the transfer hook also checks pause state, blocking all transfers.

### Unpause

**Instruction**: `unpause`
**Required Role**: Pauser
**Checks**: Role active, token is currently paused (TokenPaused)

Sets `config.paused = false` and `config.paused_by_attestation = false`, resuming normal operations.

## Role Management

### Update Roles

**Instruction**: `update_roles(role_type: u8, assignee: Pubkey, is_active: bool)`
**Required**: Authority signer

Creates or updates a `RoleAssignment` PDA. If the PDA doesn't exist, it is initialized. If it exists, only `is_active` is updated. The `role_type` is validated via `RoleType::from_u8()` which accepts values 0-6.

Role types:
| Value | Role |
|-------|------|
| 0 | Minter |
| 1 | Burner |
| 2 | Pauser |
| 3 | Freezer |
| 4 | Blacklister |
| 5 | Seizer |
| 6 | Attestor |

### Update Minter Quota

**Instruction**: `update_minter(new_quota: u64)`
**Required**: Authority signer

Sets the cumulative minting cap for a specific minter's `RoleAssignment`. The `minted_amount` field tracks total lifetime minting. To "refill" a minter, increase the quota. The `minted_amount` is never reset -- it tracks lifetime minting.

## Authority Transfer

SSS-1 implements a two-step authority transfer to prevent accidental loss of control:

### Transfer Authority

**Instruction**: `transfer_authority(new_authority: Pubkey)`
**Required**: Current authority signer
**Checks**: No transfer already pending (AuthorityTransferAlreadyPending)

Sets `pending_authority` and records `transfer_initiated_at` timestamp.

### Accept Authority

**Instruction**: `accept_authority()`
**Required**: Pending authority signer
**Checks**: Transfer is pending (AuthorityTransferNotPending), signer matches `pending_authority` (InvalidPendingAuthority)

Completes the transfer: sets `authority = pending_authority`, clears pending state.

### Cancel Authority Transfer

**Instruction**: `cancel_authority_transfer()`
**Required**: Current authority signer
**Checks**: Transfer is pending (AuthorityTransferNotPending)

Clears `pending_authority` and `transfer_initiated_at`.

## Events

SSS-1 emits Anchor events for all state changes (defined in `programs/sss-token/src/events.rs`):

| Event | Fields |
|-------|--------|
| `StablecoinInitialized` | mint, authority, decimals, name, symbol, enable_transfer_hook, enable_permanent_delegate, default_account_frozen |
| `TokensMinted` | mint, to, amount, minter |
| `TokensBurned` | mint, from, amount, burner |
| `AccountFrozen` | mint, account, freezer |
| `AccountThawed` | mint, account, freezer |
| `TokenPaused` | mint, pauser |
| `TokenUnpaused` | mint, pauser |
| `RoleUpdated` | config, assignee, role_type, is_active |
| `MinterQuotaUpdated` | config, minter, new_quota |
| `AuthorityTransferInitiated` | config, current_authority, pending_authority |
| `AuthorityTransferAccepted` | config, old_authority, new_authority |
| `AuthorityTransferCancelled` | config, authority |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | Unauthorized | Signer is not the authority |
| 6001 | InvalidRoleType | Role type value out of range (must be 0-6) |
| 6002 | RoleNotActive | Role exists but is_active = false |
| 6003 | TokenPaused | Operation blocked because token is paused |
| 6004 | TokenNotPaused | Cannot unpause a token that isn't paused |
| 6005 | MinterQuotaExceeded | Cumulative mint would exceed minter's quota |
| 6006 | InvalidMint | Mint doesn't match config (has_one constraint) |
| 6007 | InvalidConfig | Config reference doesn't match role's config |
| 6008 | AuthorityTransferNotPending | No pending transfer to accept/cancel |
| 6009 | AuthorityTransferAlreadyPending | Cannot start new transfer while one is pending |
| 6010 | InvalidPendingAuthority | Signer doesn't match pending_authority |
| 6011 | AccountAlreadyFrozen | Account is already frozen |
| 6012 | AccountNotFrozen | Cannot thaw an unfrozen account |
| 6013 | ArithmeticOverflow | Numeric overflow in checked_add |
| 6014 | InvalidDecimals | Decimals must be 0-18 |
| 6015 | NameTooLong | Name exceeds 32 characters |
| 6016 | SymbolTooLong | Symbol exceeds 10 characters |
| 6017 | UriTooLong | URI exceeds 200 characters |
| 6021 | ZeroAmount | Amount must be greater than zero |

## SSS-2 Graceful Failure

When SSS-2 instructions (`add_to_blacklist`, `remove_from_blacklist`, `seize`) are called on an SSS-1 token:

- `add_to_blacklist` / `remove_from_blacklist` fail with `ComplianceNotEnabled` (6022) -- checked via account constraint `config.enable_transfer_hook`
- `seize` fails with `PermanentDelegateNotEnabled` (6023) -- checked via `require_permanent_delegate_enabled()`

This ensures SSS-2 operations cannot be accidentally executed on tokens that were not configured for compliance.
