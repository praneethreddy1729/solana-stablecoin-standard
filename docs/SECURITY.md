# Security Model

## Overview

The Solana Stablecoin Standard's security model is built on four pillars:

1. **Role separation** -- No single key can perform all operations
2. **PDA authority** -- The Config PDA holds mint/freeze authority, not any wallet
3. **Two-step authority transfer** -- Prevents accidental authority loss
4. **On-chain enforcement** -- Business logic is enforced at the protocol level

## Code Safety Practices

The codebase follows defensive programming practices:

- **No `unwrap()`**: All fallible operations use `?` operator or `ok_or(SSSError::...)` patterns
- **No `panic!`**: No panic macros in program code
- **No `unsafe`**: No unsafe blocks
- **`checked_add` for quota tracking**: Minter quota arithmetic uses `checked_add` to prevent overflow (`programs/sss-token/src/instructions/mint.rs:52-54`)
- **Amount validation**: All mint/burn operations require `amount > 0` (ZeroAmount error)
- **Anchor constraints**: PDA validation uses `has_one`, `seeds`, and `constraint` macros for compile-time-verified account relationships

## Role Separation

### Principle of Least Privilege

Each operational role has narrowly scoped permissions:

```
Authority (admin)
  |-- Can: assign roles, set quotas, transfer authority
  |-- Cannot: mint, burn, pause, freeze, blacklist, seize (directly)

Minter
  |-- Can: mint tokens (up to quota)
  |-- Cannot: burn, pause, freeze, blacklist, manage roles

Burner
  |-- Can: burn tokens (with token owner co-sign)
  |-- Cannot: mint, pause, freeze, blacklist, manage roles

Pauser
  |-- Can: pause/unpause
  |-- Cannot: mint, burn, freeze, blacklist, manage roles

Freezer
  |-- Can: freeze/thaw individual accounts
  |-- Cannot: mint, burn, pause, blacklist, manage roles

Blacklister (SSS-2 only)
  |-- Can: add/remove from blacklist
  |-- Cannot: mint, burn, pause, freeze, manage roles, seize

Seizer (SSS-2 only)
  |-- Can: seize tokens from blacklisted accounts
  |-- Cannot: mint, burn, pause, freeze, blacklist, manage roles

Attestor
  |-- Can: submit reserve attestations (auto-pauses if undercollateralized)
  |-- Cannot: mint, burn, pause, freeze, blacklist, seize, manage roles
```

### Role Validation

Every instruction validates roles through utility functions in `programs/sss-token/src/utils/validation.rs`:

- `require_authority(config, signer)` -- checks `config.authority == signer`
- `require_role_active(role, expected_type)` -- checks both `role_type` match AND `is_active == true`
- `require_not_paused(config)` -- checks `config.paused == false`
- `require_compliance_enabled(config)` -- checks `config.enable_transfer_hook == true`
- `require_permanent_delegate_enabled(config)` -- checks `config.enable_permanent_delegate == true`

Additionally, Anchor account constraints enforce PDA derivation correctness:

```rust
// From mint.rs -- minter role validated via seeds + constraints
#[account(
    seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Minter as u8], minter.key().as_ref()],
    bump = minter_role.bump,
    constraint = minter_role.config == config.key() @ SSSError::InvalidConfig,
    constraint = minter_role.assignee == minter.key() @ SSSError::Unauthorized,
)]
pub minter_role: Account<'info, RoleAssignment>,
```

### Key Compromise Impact

| Compromised Key | Impact | Mitigation |
|----------------|--------|------------|
| Minter | Can mint up to remaining quota | Quota limits exposure; authority can deactivate role |
| Burner | Can burn tokens (but needs token owner co-sign) | Requires two signers, limiting practical impact |
| Pauser | Can pause/unpause | Can cause disruption but not fund loss; authority can deactivate |
| Freezer | Can freeze/thaw individual accounts | Can freeze accounts but not steal funds; authority can deactivate |
| Blacklister | Can blacklist/unblacklist addresses | Can block transfers but not steal funds; authority can deactivate |
| Seizer | Can seize tokens from blacklisted accounts | Can move funds from blacklisted accounts; authority can deactivate |
| Attestor | Can submit reserve attestations and trigger auto-pause | Can pause token via false undercollateralization report; authority can deactivate |
| Authority | Full control over configuration | Two-step transfer prevents instant takeover if detected |

## Authority Transfer Security

### Two-Step Process

The authority transfer uses a propose-accept pattern:

1. Current authority calls `transfer_authority(new_authority)` -- sets `pending_authority`
2. New authority calls `accept_authority()` -- completes the transfer

This prevents:
- **Typo attacks**: If the wrong address is specified, the transfer never completes
- **Social engineering**: An attacker would need to compromise both the current and target authority
- **Accidental loss**: The current authority can cancel at any time before acceptance

The `transfer_initiated_at` timestamp records when the transfer was proposed, enabling time-based policies off-chain.

## Permanent Delegate Security (SSS-2)

### What PermanentDelegate Enables

The PermanentDelegate extension gives the Config PDA the ability to transfer tokens from any token account of the mint, regardless of the account owner's consent. This is used exclusively for the `seize` instruction.

### Safeguards

1. **Only the Seizer role can seize**: The `seize` instruction requires an active Seizer role assignment (RoleType 5)
2. **All-or-nothing seizure**: Seize transfers the entire `from.amount` balance -- no partial seizure
3. **Feature flag check**: `require_permanent_delegate_enabled()` blocks seizure on SSS-1 tokens (returns `PermanentDelegateNotEnabled`)
4. **Audit trail**: Every seizure emits a `TokensSeized` event with mint, source, amount, and seizer
5. **Cannot be disabled**: Once initialized with PermanentDelegate, the delegate cannot be changed or removed (Token-2022 invariant)

## Transfer Hook Security

### Execution Flow

The transfer hook (`programs/sss-transfer-hook/src/instructions/execute.rs`) runs on every transfer for SSS-2 tokens:

1. Check if `owner_delegate` matches the permanent delegate stored in mint extension data
2. If permanent delegate: **bypass all checks** (needed for seize to work on blacklisted accounts)
3. If not: check `config.paused` (raw byte at offset 145)
4. If not: check sender `BlacklistEntry` exists (data_is_empty + data.len >= 8)
5. If not: check receiver `BlacklistEntry` exists

### Permanent Delegate Detection

The hook detects permanent delegate transfers by parsing Token-2022 mint extension data:

```rust
// Scan extensions starting at offset 166 (after 82 base + 83 padding + 1 account type)
// Look for extension type 12 (PermanentDelegate) with 32-byte delegate pubkey
// Compare delegate with owner_delegate account
```

This bypass ensures seizure works even when the target account is blacklisted.

### Blacklist Check Mechanism

```rust
if !sender_blacklist.data_is_empty() {
    let data = sender_blacklist.try_borrow_data()?;
    if data.len() >= 8 {  // Anchor discriminator present = initialized
        return Err(HookError::SenderBlacklisted.into());
    }
}
```

Security properties:
- Only the hook program can create `BlacklistEntry` PDAs (it owns them)
- PDA seeds include both mint and user, preventing cross-mint blacklist spoofing
- The 8-byte check ensures the account is initialized (has Anchor discriminator)

### Pause Check in Hook

The hook reads raw bytes from the Config PDA at offset 145 to check pause state:

```
Byte layout: 8 discriminator + 32 authority + 32 pending_authority +
             8 transfer_initiated_at + 32 mint + 32 hook_program_id +
             1 decimals = byte 145 is the paused flag
```

This raw byte access avoids deserializing the full account (cheaper CU), but assumes a stable struct layout.

### Fallback Handler

Token-2022 calls the hook with the SPL Transfer Hook Execute discriminator, not Anchor's discriminator. The `fallback` function in `lib.rs` matches the SPL discriminator and routes to the same logic, with manual account parsing from the accounts array:

```
Account layout: source(0), mint(1), destination(2), owner_delegate(3),
                extra_account_metas(4), sender_blacklist(5), receiver_blacklist(6), config(7)
```

## Account Validation Summary

| Instruction | Key Validations |
|-------------|----------------|
| `initialize` | Authority is signer, mint is signer (keypair), decimals 0-18, name <= 32, symbol <= 10, uri <= 200 |
| `mint` | Config has_one mint, minter has active Minter role (seeds + constraints), not paused, `checked_add` quota check, amount > 0, auto-thaw if default_account_frozen |
| `burn` | Config has_one mint, burner has active Burner role, not paused, from_authority is signer, amount > 0 |
| `freeze_account` | Config has_one mint, freezer has active Freezer role, account not already frozen (checked by Token-2022) |
| `thaw_account` | Config has_one mint, freezer has active Freezer role, account is frozen (checked by Token-2022) |
| `pause` | Pauser has active Pauser role, token not already paused |
| `unpause` | Pauser has active Pauser role, token is currently paused |
| `update_roles` | Authority signer, valid role type (0-6 via `RoleType::from_u8`) |
| `update_minter` | Authority signer, config constraint |
| `transfer_authority` | Authority signer, no pending transfer (`AuthorityTransferAlreadyPending`) |
| `accept_authority` | Signer matches `pending_authority`, transfer is pending |
| `cancel_authority_transfer` | Authority signer, transfer is pending |
| `add_to_blacklist` | Blacklister has active Blacklister role, `enable_transfer_hook == true`, `hook_program == config.hook_program_id`, hook validates config PDA derivation + program ownership |
| `remove_from_blacklist` | Same as add_to_blacklist |
| `seize` | Seizer role active, permanent delegate enabled, from balance > 0, destination must match `config.treasury` (InvalidTreasury), target owner must be blacklisted (TargetNotBlacklisted), uses `invoke_transfer_checked` with remaining_accounts for hook |
| `update_treasury` | Authority signer, `new_treasury != Pubkey::default()` (InvalidTreasury) |
| `attest_reserves` | Attestor has active Attestor role (RoleType 6), `expires_in_seconds > 0` (InvalidExpiration), `attestation_uri.len() <= 256` (AttestationUriTooLong), auto-sets `paused_by_attestation` if `reserve_amount < token_supply` |

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Authority key compromise | Multi-sig wallet, two-step transfer |
| Unauthorized minting | Role-based access + cumulative quotas with `checked_add` |
| Unauthorized seizure | Seizer role required (role-based), SSS-2 flag check |
| Blacklist bypass | Transfer hook enforced by Token-2022 runtime on every transfer |
| Cross-mint blacklist spoofing | Mint included in BlacklistEntry PDA seeds |
| Replay attacks | Solana transaction uniqueness guarantees |
| Config PDA manipulation | PDA owned by program, only writable through program instructions |
| Arithmetic overflow | `checked_add` on minter quota, Anchor's `require!` for other checks |
| SSS-2 on SSS-1 token | Feature flag checks (`ComplianceNotEnabled`, `PermanentDelegateNotEnabled`) |

### Known Limitations

1. **No timelock on seizure**: Seizure is immediate once the authority signs
2. **No role revocation timelock**: Roles can be deactivated instantly
3. **Quota is cumulative only**: No time-based rate limiting -- a compromised minter can use full remaining quota in one transaction
4. **No multi-party seizure**: Only the Seizer role signature is required (multi-sig Seizer wallet partially addresses this)
5. **Raw byte offset for pause check**: The transfer hook reads `config_data[145]` directly -- a struct layout change would break this
