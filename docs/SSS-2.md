# SSS-2: Compliance-Enabled Stablecoin Specification

## Overview

SSS-2 extends SSS-1 with on-chain compliance enforcement. It adds three Token-2022 extensions and introduces the transfer hook blacklist and permanent delegate seizure mechanism. SSS-2 is designed for regulated stablecoins that must enforce sanctions, AML, and asset recovery requirements.

An SSS-2 token includes all SSS-1 features plus:

- **TransferHook** -- automatic sender/receiver blacklist checking on every transfer
- **PermanentDelegate** -- Seizer role can seize tokens from any account
- **DefaultAccountState (Frozen)** -- optionally, new token accounts start frozen

## Initialization

Create an SSS-2 stablecoin by enabling compliance flags:

```rust
InitializeArgs {
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://example.com/rusd.json",
    decimals: 6,
    enable_transfer_hook: true,
    enable_permanent_delegate: true,
    default_account_frozen: true,  // optional for SSS-2
}
```

The SDK's `Preset.SSS_2` sets `enable_transfer_hook=true` and `enable_permanent_delegate=true` with `default_account_frozen=false`. Use `Preset.Custom` to enable all three.

### Extension Init Order (SSS-2)

From `programs/sss-token/src/instructions/initialize.rs`:

1. `createAccount` (allocate space for all extensions)
2. `initializePermanentDelegate` (config PDA as delegate)
3. `initializeTransferHook` (hook program ID, config PDA as authority)
4. `initializeDefaultAccountState` (Frozen) -- if enabled
5. `initializeMetadataPointer` (mint points to itself)
6. `initializeMint2` (config PDA as mint + freeze authority)
7. `initializeTokenMetadata` (name, symbol, uri)

### Additional Setup for SSS-2

After initialization, the transfer hook requires one additional setup step:

```
hookProgram.methods.initializeExtraAccountMetas()
```

This instruction (on the hook program) configures the ExtraAccountMetas PDA, which tells Token-2022 which additional accounts to pass during every transfer:

1. Sender's BlacklistEntry PDA (derived at runtime from source token account owner)
2. Receiver's BlacklistEntry PDA (derived at runtime from destination token account owner)
3. StablecoinConfig PDA (for pause state check)

## Transfer Hook Blacklist

### How It Works

On every transfer of an SSS-2 token, Token-2022 invokes the hook program's execute handler (via the SPL Transfer Hook Execute discriminator, routed through the `fallback` function in `lib.rs`).

The execute logic (`programs/sss-transfer-hook/src/instructions/execute.rs`):

1. **Check permanent delegate**: Parse mint extension data to find PermanentDelegate extension (type 12). If `owner_delegate` matches the stored delegate, bypass all checks and return OK. This is needed for `seize` to work on blacklisted accounts.

2. **Check pause state**: Read config PDA raw bytes at offset 145. If `config_data[145] == 1`, return `HookError::TokenPaused`.

3. **Check sender blacklist**: If `sender_blacklist.data_is_empty() == false` and `data.len() >= 8` (initialized Anchor account), return `HookError::SenderBlacklisted`.

4. **Check receiver blacklist**: Same check on receiver, returns `HookError::ReceiverBlacklisted`.

5. If all checks pass, return OK.

### Fallback Handler

Token-2022 calls the hook with the SPL Transfer Hook Execute discriminator, not Anchor's. The `fallback` function in `programs/sss-transfer-hook/src/lib.rs` matches the SPL discriminator and routes to `fallback_execute`, which manually parses accounts from the array:

```
Account layout: source(0), mint(1), destination(2), owner_delegate(3),
                extra_account_metas(4), sender_blacklist(5), receiver_blacklist(6), config(7)
```

## Blacklist Management

### Add to Blacklist

**Main program instruction**: `add_to_blacklist(user: Pubkey, reason: String)`
**Required Role**: Blacklister
**Checks**: `config.enable_transfer_hook == true` (ComplianceNotEnabled), `hook_program == config.hook_program_id` (InvalidHookProgram), role active

Flow:
1. Main program validates the blacklister has an active Blacklister role
2. Main program validates compliance is enabled via account constraint
3. Main program constructs CPI using `HOOK_ADD_BLACKLIST_DISC` (`[90, 115, 98, 231, 173, 119, 117, 176]`)
4. Hook program creates `BlacklistEntry` PDA with seeds `[b"blacklist", mint, user]`, storing the `reason` string
5. Main program emits `AddressBlacklisted` event

### Remove from Blacklist

**Main program instruction**: `remove_from_blacklist(user: Pubkey)`
**Required Role**: Blacklister
**Checks**: Same as add

Flow:
1. Main program validates the blacklister role and compliance flags
2. Main program CPIs into hook using `HOOK_REMOVE_BLACKLIST_DISC` (`[47, 105, 20, 10, 165, 168, 203, 219]`)
3. Hook program closes the `BlacklistEntry` PDA (rent returned to blacklister)
4. Main program emits `AddressUnblacklisted` event

### BlacklistEntry PDA

```
Account: BlacklistEntry (77 + reason_len bytes)
Seeds: [b"blacklist", mint.key(), user.key()]
Owner: sss-transfer-hook program

Fields:
  - mint: Pubkey (32 bytes)
  - user: Pubkey (32 bytes)
  - reason: String (4 + reason_len bytes, max 64 bytes)
  - bump: u8 (1 byte)
```

The blacklist uses an existence-based model: if the account exists and has data (>= 8 bytes = Anchor discriminator present), the address is blacklisted. The transfer hook checks `data_is_empty()` and `data.len() >= 8`.

Blacklists are **per-mint**: an address blacklisted for one stablecoin is not automatically blacklisted for another.

## Seizure (Permanent Delegate)

### Seize Instruction

**Instruction**: `seize()`
**Required**: Seizer role (RoleType 5)
**Checks**: `require_role_active(seizer_role, RoleType::Seizer)`, `require_permanent_delegate_enabled()`, `from.amount > 0` (ZeroAmount)

The seize operation transfers **all tokens** from a target account to a destination account. The Config PDA, set as permanent delegate during initialization, signs the transfer.

Implementation (`programs/sss-token/src/instructions/seize.rs`):
- Uses `spl_token_2022::onchain::invoke_transfer_checked` which automatically resolves the transfer hook from mint extension data
- The client must pass remaining accounts: `[hook_program, extra_account_metas, sender_blacklist, receiver_blacklist, config]`
- The hook's permanent delegate bypass ensures the transfer succeeds even if the source is blacklisted

### Permanent Delegate Bypass

The hook detects permanent delegate transfers by parsing Token-2022 mint extension data:

```rust
// Token-2022 mint: 82 base + padding to 165 + 1 account type = 166 offset
// Extensions start at offset 166
// Each: 2 bytes type + 2 bytes length + data
// PermanentDelegate = type 12, data = 32 bytes (delegate pubkey)
```

If `owner_delegate` matches the permanent delegate, all blacklist and pause checks are bypassed.

### Post-Seizure State

- Source token account has 0 balance but still exists
- BlacklistEntry PDA still exists (address remains blacklisted)
- Source account may still be frozen
- `TokensSeized` event emitted with mint, from, amount, seizer

## Default Frozen Accounts

When `default_account_frozen = true`, every new Associated Token Account for this mint starts frozen. This means:

1. Users cannot transfer tokens until their account is explicitly thawed
2. The `mint` instruction automatically thaws the recipient before minting (if `config.default_account_frozen && to.is_frozen()`)
3. Provides a "whitelist by default" model where accounts must be approved before use

Note: The SDK's `Preset.SSS_2` sets `default_account_frozen = false`. To enable it, use `Preset.Custom` with `defaultAccountFrozen: true`.

## Hook Program Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | SenderBlacklisted | Transfer blocked: sender is on the blacklist |
| 6001 | ReceiverBlacklisted | Transfer blocked: receiver is on the blacklist |
| 6002 | TokenPaused | Transfer blocked: token is globally paused |
| 6003 | InvalidBlacklistEntry | Blacklist PDA validation failed |
| 6004 | AlreadyBlacklisted | Address is already blacklisted |
| 6005 | NotBlacklisted | Address is not blacklisted (cannot remove) |
| 6006 | Unauthorized | Caller is not authorized for this operation |

## Additional SSS-2 Events

| Event | Fields |
|-------|--------|
| `AddressBlacklisted` | mint, address, blacklister, reason |
| `AddressUnblacklisted` | mint, address, blacklister |
| `TokensSeized` | mint, from, amount, seizer |

## Graceful Failure on SSS-1 Tokens

SSS-2 instructions check feature flags before execution:

- `add_to_blacklist` / `remove_from_blacklist`: Account constraint checks `config.enable_transfer_hook`. If `false`, returns `ComplianceNotEnabled` (6022).
- `seize`: Calls `require_permanent_delegate_enabled()`. If `false`, returns `PermanentDelegateNotEnabled` (6023).
