# Events

All state-changing instructions in the `sss-token` program emit Anchor events for off-chain indexing. Events are logged in the transaction's program log and can be parsed using the Anchor event parser.

## Listening for Events

```typescript
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";

program.addEventListener("stablecoinInitialized", (event, slot, sig) => {
  console.log("New stablecoin:", event.mint.toBase58());
});

// Remove listener when done
program.removeEventListener(listenerId);
```

---

## sss-token Program Events

### `StablecoinInitialized`

Emitted when a new stablecoin mint is created via `initialize`.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | The Token-2022 mint address |
| `authority` | `Pubkey` | Initial authority wallet |
| `decimals` | `u8` | Token decimals |
| `name` | `String` | Token name |
| `symbol` | `String` | Token symbol |
| `enable_transfer_hook` | `bool` | Whether transfer hook (SSS-2) is enabled |
| `enable_permanent_delegate` | `bool` | Whether permanent delegate (SSS-2) is enabled |
| `default_account_frozen` | `bool` | Whether new accounts start frozen |

---

### `StablecoinRegistered`

Emitted when a stablecoin is added to the on-chain registry via `initialize` (registry entry created).

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | The Token-2022 mint address |
| `issuer` | `Pubkey` | The issuer (authority) wallet |
| `compliance_level` | `u8` | Compliance preset (0 = SSS-1, 1 = SSS-2) |
| `name` | `String` | Token name |
| `symbol` | `String` | Token symbol |

---

### `TokensMinted`

Emitted by `mint` when tokens are successfully minted.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `to` | `Pubkey` | Recipient token account |
| `amount` | `u64` | Number of base units minted |
| `minter` | `Pubkey` | The minter's wallet address |

---

### `TokensBurned`

Emitted by `burn` when tokens are successfully burned.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `from` | `Pubkey` | Source token account |
| `amount` | `u64` | Number of base units burned |
| `burner` | `Pubkey` | The burner's wallet address |

---

### `AccountFrozen`

Emitted by `freeze_account` when a token account is frozen.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `account` | `Pubkey` | The frozen token account |
| `freezer` | `Pubkey` | The freezer's wallet address |

---

### `AccountThawed`

Emitted by `thaw_account` when a token account is thawed.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `account` | `Pubkey` | The thawed token account |
| `freezer` | `Pubkey` | The freezer's wallet address |

---

### `TokenPaused`

Emitted by `pause` when the global pause flag is set.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `pauser` | `Pubkey` | The pauser's wallet address |

---

### `TokenUnpaused`

Emitted by `unpause` when the global pause flag is cleared.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `pauser` | `Pubkey` | The pauser's wallet address |

---

### `RoleUpdated`

Emitted by `update_roles` when a role assignment is created or updated.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `assignee` | `Pubkey` | Wallet receiving the role |
| `role_type` | `u8` | Role enum: 0=Minter, 1=Burner, 2=Pauser, 3=Freezer, 4=Blacklister, 5=Seizer, 6=Attestor |
| `is_active` | `bool` | Whether the role is active after the update |

---

### `MinterQuotaUpdated`

Emitted by `update_minter` when a minter's cumulative quota is changed.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `minter` | `Pubkey` | The minter's wallet address |
| `new_quota` | `u64` | New cumulative mint cap in base units |

---

### `AuthorityTransferInitiated`

Emitted by `transfer_authority` when a two-step authority transfer is proposed.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `current_authority` | `Pubkey` | The current authority wallet |
| `pending_authority` | `Pubkey` | The proposed new authority wallet |

---

### `AuthorityTransferAccepted`

Emitted by `accept_authority` when the pending authority accepts the transfer.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `old_authority` | `Pubkey` | The previous authority wallet |
| `new_authority` | `Pubkey` | The new authority wallet |

---

### `AuthorityTransferCancelled`

Emitted by `cancel_authority_transfer` when a pending transfer is cancelled.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `authority` | `Pubkey` | The current authority who cancelled |

---

### `AddressBlacklisted`

Emitted by `add_to_blacklist` (via CPI to hook program) when an address is blacklisted. SSS-2 only.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `address` | `Pubkey` | The blacklisted wallet |
| `blacklister` | `Pubkey` | The blacklister's wallet address |
| `reason` | `String` | Reason string (max 64 bytes) |

---

### `AddressUnblacklisted`

Emitted by `remove_from_blacklist` when an address is removed from the blacklist. SSS-2 only.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `address` | `Pubkey` | The unblacklisted wallet |
| `blacklister` | `Pubkey` | The blacklister's wallet address |

---

### `TokensSeized`

Emitted by `seize` when tokens are seized from a blacklisted account. SSS-2 only.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Mint address |
| `from` | `Pubkey` | Source token account (blacklisted owner) |
| `to` | `Pubkey` | Destination treasury token account |
| `amount` | `u64` | Number of base units seized |
| `seizer` | `Pubkey` | The seizer's wallet address |

---

### `ReservesAttested`

Emitted by `attest_reserves` when a reserve proof is submitted. Auto-pause is reflected in `auto_paused`.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `attestor` | `Pubkey` | The attestor's wallet address |
| `reserve_amount` | `u64` | Declared reserve amount in base units |
| `token_supply` | `u64` | Current token supply at time of attestation |
| `collateralization_ratio_bps` | `u64` | Collateralization ratio in basis points (10000 = 100%) |
| `auto_paused` | `bool` | Whether the token was auto-paused due to undercollateralization |
| `timestamp` | `i64` | Unix timestamp of the attestation |

---

### `TreasuryUpdated`

Emitted by `update_treasury` when the treasury token account is changed.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Pubkey` | StablecoinConfig PDA |
| `old_treasury` | `Pubkey` | Previous treasury token account |
| `new_treasury` | `Pubkey` | New treasury token account |
| `authority` | `Pubkey` | The authority who made the change |

---

## Event Summary

| Event | Instruction | Program |
|-------|-------------|---------|
| `StablecoinInitialized` | `initialize` | sss-token |
| `StablecoinRegistered` | `initialize` | sss-token |
| `TokensMinted` | `mint` | sss-token |
| `TokensBurned` | `burn` | sss-token |
| `AccountFrozen` | `freeze_account` | sss-token |
| `AccountThawed` | `thaw_account` | sss-token |
| `TokenPaused` | `pause` | sss-token |
| `TokenUnpaused` | `unpause` | sss-token |
| `RoleUpdated` | `update_roles` | sss-token |
| `MinterQuotaUpdated` | `update_minter` | sss-token |
| `AuthorityTransferInitiated` | `transfer_authority` | sss-token |
| `AuthorityTransferAccepted` | `accept_authority` | sss-token |
| `AuthorityTransferCancelled` | `cancel_authority_transfer` | sss-token |
| `AddressBlacklisted` | `add_to_blacklist` | sss-token |
| `AddressUnblacklisted` | `remove_from_blacklist` | sss-token |
| `TokensSeized` | `seize` | sss-token |
| `ReservesAttested` | `attest_reserves` | sss-token |
| `TreasuryUpdated` | `update_treasury` | sss-token |

**Total: 18 event types** (all emitted by sss-token; the transfer hook program does not emit events directly)
