# Solana Stablecoin Standard (SSS)

A two-tier stablecoin specification for Solana built on Token-2022 with role-based access control, compliance enforcement, and asset recovery.

## Standard Presets

SSS defines two composable specification levels. Choose the one that matches your regulatory requirements:

| Feature | SSS-1 (Basic) | SSS-2 (Compliance) |
|---------|:-:|:-:|
| Mint / Burn | Yes | Yes |
| Freeze / Thaw | Yes | Yes |
| Pause / Unpause | Yes | Yes |
| Role-Based Access Control (7 roles) | Yes | Yes |
| Two-Step Authority Transfer | Yes | Yes |
| Minter Quota (cumulative cap) | Yes | Yes |
| Token-2022 Metadata | Yes | Yes |
| Transfer Hook (blacklist enforcement) | -- | Yes |
| Permanent Delegate (asset seizure) | -- | Yes |
| Default Account State (frozen) | -- | Optional |
| CPI Blacklist Management | -- | Yes |

**SSS-1** is suitable for internal-use or lightly-regulated stablecoins that need basic issuance controls.
**SSS-2** adds the compliance layer required by most regulated fiat-backed stablecoins: per-transfer blacklist checks, the ability to seize assets from sanctioned accounts, and optional default-frozen accounts for KYC gating.

## Program IDs

| Program | Devnet | Localnet |
|---------|--------|----------|
| `sss-token` | `tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz` | `tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz` |
| `sss-transfer-hook` | `A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB` | `A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB` |

### Deployed on Devnet

Both programs are deployed and verified on Solana Devnet:

- **sss-token**: [`tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz`](https://explorer.solana.com/address/tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz?cluster=devnet)
- **sss-transfer-hook**: [`A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB`](https://explorer.solana.com/address/A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB?cluster=devnet)

### Devnet Proof Script

A self-contained script demonstrates the full SSS-1 lifecycle on devnet:

```bash
npx ts-node scripts/devnet-proof.ts
```

The script performs the following operations against the deployed programs:

| Step | Operation | Description |
|:----:|-----------|-------------|
| 1 | `initialize` | Creates an SSS-1 stablecoin (SSSD, 6 decimals) |
| 2 | `update_roles` | Assigns Minter role to the authority wallet |
| 3 | `update_roles` | Assigns Burner role to the authority wallet |
| 4 | `update_minter` | Sets minter quota to 10,000 tokens |
| 5 | `mint` | Mints 100 SSSD to the authority's token account |
| 6 | `burn` | Burns 25 SSSD, leaving 75 SSSD remaining |

All six transactions are signed and submitted to devnet, with explorer links printed for each.

> **Note:** Devnet currently runs Agave 3.0.x which has a known SIMD-0219 bug affecting Token-2022 metadata reallocation ([anza-xyz/agave#9799](https://github.com/anza-xyz/agave/issues/9799)). This feature is deactivated in the local test validator via `Anchor.toml`, but cannot be deactivated on devnet. If the script fails due to this issue, the programs themselves are still deployed and verifiable at the explorer links above.

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (Agave 3.0.x)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (0.32.1)
- [Node.js](https://nodejs.org/) (>= 20)
- [Yarn](https://yarnpkg.com/) (v1)

### Clone and Build

```bash
git clone https://github.com/praneethg/solana-stablecoin-standard.git
cd solana-stablecoin-standard
yarn install
anchor build
```

### Agave 3.0.x Workaround

The test validator deactivates SIMD-0219 (feature `CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM`) in `Anchor.toml` to work around a Token-2022 metadata realloc bug ([anza-xyz/agave#9799](https://github.com/anza-xyz/agave/issues/9799)). No action is required -- the deactivation is automatic when running `anchor test`.

## Quick Start

### Create an SSS-1 Token (Basic)

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,
  {
    name: "TestUSD",
    symbol: "TUSD",
    uri: "https://example.com/tusd.json",
    decimals: 6,
    preset: Preset.SSS_1,
    authority: keypair,
  }
);
```

### Create an SSS-2 Token (Compliance)

```typescript
const { stablecoin } = await SolanaStablecoin.create(
  connection,
  {
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://example.com/rusd.json",
    decimals: 6,
    preset: Preset.SSS_2,
    authority: keypair,
  }
);
```

### Mint Tokens

```typescript
import BN from "bn.js";

await stablecoin.mint(
  recipientTokenAccount,
  new BN(1_000_000),           // 1.0 TUSD (6 decimals)
  minterKeypair.publicKey,
);
```

### Compliance Operations (SSS-2)

```typescript
// Blacklist a sanctioned address
await stablecoin.compliance.blacklistAdd(
  sanctionedWallet,
  blacklisterKeypair.publicKey,
  "OFAC SDN List",
);

// Seize tokens from blacklisted account
await stablecoin.compliance.seize(
  sanctionedTokenAccount,
  treasuryTokenAccount,
);

// Check blacklist status
const isBlacklisted = await stablecoin.compliance.isBlacklisted(someWallet);
```

## Architecture

```
+-----------------------------------------------------------------------+
|                         TypeScript SDK / CLI                          |
|  SolanaStablecoin class  |  PDA helpers  |  CLI commands (13 cmds)   |
+----------------------------------+------------------------------------+
                                   |
              Anchor RPC / CPI     |
                                   v
+----------------------------------+------------------------------------+
|          sss-token program          |    sss-transfer-hook program    |
|          (17 instructions)          |    (5 instructions + fallback)  |
|                                     |                                 |
|  Initialize   Mint      Burn       |  InitializeExtraAccountMetas    |
|  Freeze       Thaw      Pause      |  UpdateExtraAccountMetas        |
|  Unpause      UpdateRoles          |  Execute (blacklist + pause)    |
|  UpdateMinterQuota                 |  AddToBlacklist                 |
|  TransferAuthority                 |  RemoveFromBlacklist            |
|  AcceptAuthority                   |  Fallback (SPL hook disc)       |
|  CancelAuthorityTransfer           |                                 |
|  AddToBlacklist (CPI ->)           |                                 |
|  RemoveFromBlacklist (CPI ->)      |                                 |
|  Seize (permanent delegate)        |                                 |
|  UpdateTreasury (authority)        |                                 |
|  AttestReserves (attestor)         |                                 |
+----------------------------------+------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                    Token-2022 (SPL Token Extensions)                  |
|  MetadataPointer | TransferHook | PermanentDelegate | DefaultAcctSt  |
+-----------------------------------------------------------------------+
```

The **Config PDA** serves as mint authority, freeze authority, and permanent delegate, ensuring all privileged operations go through the program's role-based access control layer.

## On-Chain Programs

### StablecoinConfig Account

The central configuration account for each stablecoin instance. One per mint.

| Field | Type | Size (bytes) | Description |
|-------|------|:---:|-------------|
| `authority` | `Pubkey` | 32 | Admin who manages roles, quotas, and authority transfers |
| `pending_authority` | `Pubkey` | 32 | Proposed new authority (two-step transfer) |
| `transfer_initiated_at` | `i64` | 8 | Timestamp of authority transfer proposal (0 if none) |
| `mint` | `Pubkey` | 32 | The Token-2022 mint this config controls |
| `hook_program_id` | `Pubkey` | 32 | Transfer hook program ID (`default()` if SSS-1) |
| `decimals` | `u8` | 1 | Token decimals (0-18) |
| `paused` | `bool` | 1 | Global pause flag |
| `enable_transfer_hook` | `bool` | 1 | SSS-2 transfer hook enabled |
| `enable_permanent_delegate` | `bool` | 1 | SSS-2 permanent delegate enabled |
| `default_account_frozen` | `bool` | 1 | New accounts start frozen |
| `bump` | `u8` | 1 | PDA bump seed |
| `treasury` | `Pubkey` | 32 | Treasury token account for seized funds |
| `paused_by_attestation` | `bool` | 1 | Auto-pause flag from reserve attestation |
| `_reserved` | `[u8; 31]` | 31 | Reserved for future upgrades |
| | **Total** | **247** | (including 8-byte Anchor discriminator) |

### RoleAssignment Account

One PDA per (config, role_type, assignee) triple.

| Field | Type | Size (bytes) | Description |
|-------|------|:---:|-------------|
| `config` | `Pubkey` | 32 | Parent StablecoinConfig |
| `assignee` | `Pubkey` | 32 | Wallet holding this role |
| `role_type` | `u8` | 1 | Role enum value (0-6) |
| `is_active` | `bool` | 1 | Whether the role is currently active |
| `minter_quota` | `u64` | 8 | Cumulative mint cap (Minter only) |
| `minted_amount` | `u64` | 8 | Amount already minted (Minter only) |
| `bump` | `u8` | 1 | PDA bump seed |
| `_reserved` | `[u8; 64]` | 64 | Reserved for future upgrades |
| | **Total** | **155** | (including 8-byte discriminator) |

### BlacklistEntry Account (Hook Program)

PDA existence means the address is blacklisted. Closed on removal.

| Field | Type | Size (bytes) | Description |
|-------|------|:---:|-------------|
| `mint` | `Pubkey` | 32 | The mint this entry applies to |
| `user` | `Pubkey` | 32 | The blacklisted wallet |
| `reason` | `String` | 4 + len | Blacklist reason (max 64 bytes) |
| `bump` | `u8` | 1 | PDA bump seed |
| | **Total** | **77 + reason_len** | (including 8-byte discriminator) |

### PDA Seeds

| PDA | Program | Seeds |
|-----|---------|-------|
| `StablecoinConfig` | sss-token | `["config", mint]` |
| `RoleAssignment` | sss-token | `["role", config, role_type_u8, assignee]` |
| `BlacklistEntry` | sss-transfer-hook | `["blacklist", mint, user]` |
| `ExtraAccountMetas` | sss-transfer-hook | `["extra-account-metas", mint]` |
| `ReserveAttestation` | sss-token | `["attestation", config]` |

### Core Instructions (SSS-1 + SSS-2)

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `initialize` | Authority | Create mint with Token-2022 extensions + config PDA |
| `mint` | Minter | Mint tokens to a token account (checks pause + quota) |
| `burn` | Burner | Burn tokens from a token account (requires owner co-sign) |
| `freeze_account` | Freezer | Freeze a token account via Token-2022 |
| `thaw_account` | Freezer | Thaw a frozen token account |
| `pause` | Pauser | Set global pause flag (blocks mint, burn, transfer) |
| `unpause` | Pauser | Clear global pause flag |
| `update_roles` | Authority | Create or update a role assignment |
| `update_minter` | Authority | Set a minter's cumulative mint cap |
| `transfer_authority` | Authority | Propose a new authority (two-step) |
| `accept_authority` | Pending Authority | Accept the authority transfer |
| `cancel_authority_transfer` | Authority | Cancel a pending authority transfer |

### SSS-2 Instructions (Compliance)

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `add_to_blacklist` | Blacklister | Blacklist an address via CPI to hook program (accepts reason string, max 64 bytes) |
| `remove_from_blacklist` | Blacklister | Remove address from blacklist via CPI |
| `seize` | Seizer | Transfer tokens from blacklisted account using permanent delegate |
| `update_treasury` | Authority | Set treasury Pubkey for seized token destination |
| `attest_reserves` | Attestor | Submit reserve proof; auto-pauses if undercollateralized |

### Role-Based Access Control

| Role | ID | Permissions |
|------|----|-------------|
| Minter | 0 | Mint tokens (with cumulative quota enforced via `checked_add`) |
| Burner | 1 | Burn tokens (requires token account owner co-sign) |
| Pauser | 2 | Pause / unpause all operations globally |
| Freezer | 3 | Freeze / thaw individual token accounts |
| Blacklister | 4 | Manage transfer blacklist (SSS-2 only) |
| Seizer | 5 | Seize tokens from blacklisted accounts (SSS-2 only) |
| Attestor | 6 | Submit reserve attestations (proof of reserves) |

The **authority** manages all roles and quotas. Authority transfer uses a two-step propose-accept pattern to prevent accidental lockout.

Multiple wallets can hold the same role type simultaneously (e.g., multiple minters with independent quotas).

## Token-2022 Extensions

SSS leverages four Token-2022 extensions. The extensions are configured at mint creation time and cannot be changed afterward.

| Extension | SSS-1 | SSS-2 | Purpose |
|-----------|:-----:|:-----:|---------|
| `MetadataPointer` | Yes | Yes | On-chain token metadata (name, symbol, URI) |
| `TransferHook` | -- | Yes | Blacklist enforcement on every transfer |
| `PermanentDelegate` | -- | Yes | Asset seizure from any token account |
| `DefaultAccountState` | -- | Optional | New token accounts start frozen (KYC gating) |

### Extension Initialization Order

Extensions must be initialized in a specific order before `initializeMint2`:

```
1. createAccount (allocate space for all extensions)
2. PermanentDelegate
3. TransferHook
4. DefaultAccountState
5. MetadataPointer
6. initializeMint2
7. TokenMetadata (initialize + update fields)
```

This order is enforced by the `initialize` instruction. The Config PDA is set as:
- **Mint authority** (controls issuance)
- **Freeze authority** (controls account freezing)
- **Permanent delegate** (enables seizure, SSS-2 only)

## Transfer Hook

The `sss-transfer-hook` program enforces compliance on every Token-2022 transfer.

### How It Works

1. Token-2022 detects the `TransferHook` extension on the mint
2. It invokes the hook program with the SPL Transfer Hook Execute discriminator
3. The hook's `fallback` handler routes the call to `execute`
4. `execute` checks:
   - The token is **not paused** (reads `StablecoinConfig` via `AccountData`)
   - The **sender** is not blacklisted (checks `BlacklistEntry` PDA existence)
   - The **receiver** is not blacklisted (checks `BlacklistEntry` PDA existence)
5. If any check fails, the entire transfer is reverted

### ExtraAccountMetas

The hook uses `ExtraAccountMetaList` to pass additional accounts to every transfer:

| Account | Type | Description |
|---------|------|-------------|
| `config` | `AccountData` | StablecoinConfig PDA (for pause check) |
| `sender_blacklist` | `AccountData` | Sender's BlacklistEntry PDA (may not exist) |
| `receiver_blacklist` | `AccountData` | Receiver's BlacklistEntry PDA (may not exist) |
| `hook_program` | `Program` | The hook program itself |

### Seize Bypass

When the Seizer seizes tokens, the permanent delegate transfers directly via Token-2022. The hook's `execute` function detects this (source == permanent delegate) and allows it to proceed even if the account is blacklisted.

## CLI

The `sss-token` CLI provides 13 commands for managing stablecoins from the terminal.

### Usage

```bash
cd sdk/cli
npx ts-node src/index.ts <command> [options]
```

### Commands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `init` | Create a new stablecoin | `--name`, `--symbol`, `--decimals`, `--preset SSS-1\|SSS-2` |
| `mint` | Mint tokens to an address | `--mint`, `--to`, `--amount` |
| `burn` | Burn tokens from an account | `--mint`, `--from`, `--amount` |
| `freeze` | Freeze a token account | `--mint`, `--account` |
| `thaw` | Thaw a frozen token account | `--mint`, `--account` |
| `pause` | Pause all operations | `--mint` |
| `unpause` | Resume operations | `--mint` |
| `blacklist add` | Add address to blacklist | `--mint`, `--user`, `--reason` |
| `blacklist remove` | Remove address from blacklist | `--mint`, `--user` |
| `blacklist check` | Check if address is blacklisted | `--mint`, `--user` |
| `seize` | Seize tokens from blacklisted account | `--mint`, `--from`, `--to` |
| `status` | Show stablecoin config and state | `--mint` |
| `supply` | Show current token supply | `--mint` |
| `minters` | List minters and their quotas | `--mint` |
| `holders` | List all token holders | `--mint` |
| `audit-log` | View on-chain event history | `--mint` |

All commands accept `--rpc-url` and `--keypair` options.

### Example: Full SSS-2 Lifecycle

```bash
# Create a compliance stablecoin
sss-token init --name "RegUSD" --symbol "rUSD" --decimals 6 --preset SSS-2

# Mint tokens
sss-token mint --mint <MINT_ADDRESS> --to <TOKEN_ACCOUNT> --amount 1000000

# Blacklist a sanctioned address
sss-token blacklist add --mint <MINT_ADDRESS> --user <WALLET> --reason "OFAC SDN"

# Seize tokens from the blacklisted account
sss-token seize --mint <MINT_ADDRESS> --from <TOKEN_ACCOUNT> --to <TREASURY_ACCOUNT>

# Check status
sss-token status --mint <MINT_ADDRESS>
```

## TypeScript SDK

The SDK exposes the `SolanaStablecoin` class as the primary interface.

### API Surface

```typescript
class SolanaStablecoin {
  // Factory methods
  static create(connection, params: InitializeParams & { authority: Keypair }): Promise<{ stablecoin, mintKeypair, txSig }>
  static load(connection, wallet, mintAddress): Promise<SolanaStablecoin>

  // Read
  getConfig(): Promise<StablecoinConfig>

  // Core operations
  mint(to: PublicKey, amount: BN, minter: PublicKey): Promise<TransactionSignature>
  burn(from: PublicKey, amount: BN, burner: PublicKey, fromAuthority?: PublicKey): Promise<TransactionSignature>
  freeze(params: FreezeThawParams): Promise<TransactionSignature>
  thaw(params: FreezeThawParams): Promise<TransactionSignature>
  pause(params: PauseParams): Promise<TransactionSignature>
  unpause(params: PauseParams): Promise<TransactionSignature>

  // Role management
  updateRoles(params: UpdateRolesParams): Promise<TransactionSignature>
  updateMinterQuota(params: UpdateMinterQuotaParams): Promise<TransactionSignature>

  // Authority transfer
  transferAuthority(newAuthority: PublicKey): Promise<TransactionSignature>
  acceptAuthority(): Promise<TransactionSignature>
  cancelAuthorityTransfer(): Promise<TransactionSignature>

  // SSS-2 Compliance
  compliance: {
    blacklistAdd(address: PublicKey, blacklister: PublicKey, reason?: string): Promise<TransactionSignature>
    blacklistRemove(address: PublicKey, blacklister: PublicKey): Promise<TransactionSignature>
    seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<TransactionSignature>
    isBlacklisted(user: PublicKey): Promise<boolean>
  }
}
```

### PDA Helpers

```typescript
import { findConfigPda, findRolePda, findBlacklistPda, findExtraAccountMetasPda } from "@stbr/sss-token";

const [configPda, bump] = findConfigPda(mintPublicKey);
const [rolePda]         = findRolePda(configPda, RoleType.Minter, assignee);
const [blacklistPda]    = findBlacklistPda(mintPublicKey, userWallet);
const [extraMetas]      = findExtraAccountMetasPda(mintPublicKey);
```

### Error Handling

```typescript
import { parseSSSError } from "@stbr/sss-token";

try {
  await stablecoin.mint(recipientAta, amount, minterPubkey);
} catch (err) {
  const parsed = parseSSSError(err);
  if (parsed) {
    console.error(`SSS Error ${parsed.code}: ${parsed.name} - ${parsed.msg}`);
  }
}
```

## Error Codes

### sss-token Program Errors

| Code | Name | Message |
|:----:|------|---------|
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
| 6024 | `ReasonTooLong` | Blacklist reason exceeds 64 bytes |
| 6025 | `InvalidTreasury` | Seized tokens must go to the designated treasury |
| 6026 | `TargetNotBlacklisted` | Target account owner is not blacklisted |
| 6027 | `AccountDeliberatelyFrozen` | Account is deliberately frozen and cannot be auto-thawed |
| 6028 | `InvalidBlacklistEntry` | Invalid blacklist entry PDA |
| 6029 | `InvalidFromOwner` | Invalid from account owner |
| 6030 | `AttestationUriTooLong` | Attestation URI too long (max 256 bytes) |
| 6031 | `InvalidExpiration` | Invalid expiration: must be positive |
| 6032 | `Undercollateralized` | Undercollateralized: reserves are below token supply |
| 6033 | `CannotFreezeTreasury` | Cannot freeze the treasury account |

### sss-transfer-hook Program Errors

| Code | Name | Message |
|:----:|------|---------|
| 6000 | `SenderBlacklisted` | Sender is blacklisted |
| 6001 | `ReceiverBlacklisted` | Receiver is blacklisted |
| 6002 | `TokenPaused` | Token is paused |
| 6003 | `InvalidBlacklistEntry` | Invalid blacklist entry |
| 6004 | `AlreadyBlacklisted` | Already blacklisted |
| 6005 | `NotBlacklisted` | Not blacklisted |
| 6006 | `Unauthorized` | Unauthorized |

## Events

All state-changing instructions emit Anchor events for off-chain indexing.

| Event | Fields | Emitted By |
|-------|--------|------------|
| `StablecoinInitialized` | mint, authority, decimals, name, symbol, enable_transfer_hook, enable_permanent_delegate, default_account_frozen | `initialize` |
| `TokensMinted` | mint, to, amount, minter | `mint` |
| `TokensBurned` | mint, from, amount, burner | `burn` |
| `AccountFrozen` | mint, account, freezer | `freeze_account` |
| `AccountThawed` | mint, account, freezer | `thaw_account` |
| `TokenPaused` | mint, pauser | `pause` |
| `TokenUnpaused` | mint, pauser | `unpause` |
| `RoleUpdated` | config, assignee, role_type, is_active | `update_roles` |
| `MinterQuotaUpdated` | config, minter, new_quota | `update_minter` |
| `AuthorityTransferInitiated` | config, current_authority, pending_authority | `transfer_authority` |
| `AuthorityTransferAccepted` | config, old_authority, new_authority | `accept_authority` |
| `AuthorityTransferCancelled` | config, authority | `cancel_authority_transfer` |
| `AddressBlacklisted` | mint, address, blacklister, reason | `add_to_blacklist` |
| `AddressUnblacklisted` | mint, address, blacklister | `remove_from_blacklist` |
| `TokensSeized` | mint, from, to, amount, seizer | `seize` |
| `ReservesAttested` | config, attestor, reserve_amount, token_supply, collateralization_ratio_bps, auto_paused, timestamp | `attest_reserves` |
| `TreasuryUpdated` | config, old_treasury, new_treasury, authority | `update_treasury` |

## Security

### Access Control

- All privileged operations require an active `RoleAssignment` PDA or authority signature
- Authority transfer uses a two-step propose-accept pattern to prevent accidental lockout
- Minter quotas use `checked_add` for overflow-safe cumulative tracking
- Pause flag is checked by mint, burn, and (via transfer hook) transfer operations

### Compilation Hardening

- `overflow-checks = true` in `[profile.release]` -- all arithmetic overflow panics in release builds
- `lto = "fat"` and `codegen-units = 1` for maximum optimization
- Anchor discriminator validation on all accounts

### On-Chain Invariants

- Config PDA is the sole mint authority, freeze authority, and permanent delegate
- BlacklistEntry PDAs are owned by the hook program; main program manages them via CPI only
- Seize requires the target account to be blacklisted (checked in instruction)
- SSS-2 instructions fail with `ComplianceNotEnabled` or `PermanentDelegateNotEnabled` on SSS-1 tokens

### Audit Status

This code has not been formally audited. Use at your own risk in production environments.

## Testing

### Run All Tests

```bash
anchor test
```

### Test Breakdown

**347+ tests** across 15 test files covering all instructions, role checks, compliance flows, and edge cases. See [docs/TESTING.md](docs/TESTING.md) for the full breakdown.

### What Tests Verify

- Role-gated access (unauthorized signers rejected)
- Pause enforcement across mint, burn, and transfer
- Minter quota cumulative tracking and overflow protection
- Freeze/thaw idempotency guards (AccountAlreadyFrozen, AccountNotFrozen)
- Two-step authority transfer (propose, accept, cancel)
- Blacklist enforcement on both sender and receiver
- Seize via permanent delegate (requires Seizer role)
- Blacklist reason field validation (max 64 bytes, ReasonTooLong error)
- SSS-2 instructions rejected on SSS-1 tokens

## Project Structure

```
solana-stablecoin-standard/
  programs/
    sss-token/                 Main stablecoin program (Anchor/Rust)
      src/
        instructions/          17 instruction handlers
        state/                 StablecoinConfig, RoleAssignment
        errors.rs              34 error variants (6000-6033)
        events.rs              17 event structs
        constants.rs           PDA seeds, account sizes, CPI discriminators
        utils/                 Validation, PDA, Token-2022 helpers
    sss-transfer-hook/         Transfer hook program (Anchor/Rust)
      src/
        instructions/          5 instruction handlers + fallback
        state.rs               BlacklistEntry
        errors.rs              7 error variants (6000-6006)
  sdk/
    core/                      TypeScript SDK
      src/
        SolanaStablecoin.ts    Main class (factory + all operations)
        types.ts               Interfaces, enums, params
        pda.ts                 PDA derivation helpers
        constants.ts           Program IDs, seeds
        errors.ts              Error parsing utilities
        index.ts               Re-exports
    cli/                       CLI tool (commander.js)
      src/
        commands/              13 command modules
        helpers.ts             Wallet/connection utilities
        index.ts               Entry point
  tests/                       347+ tests across 15 files
  backend/                     Fastify REST API (port 3001)
  frontend/                    Next.js dashboard
  docs/                        Extended documentation (11 files)
  target/                      Build artifacts (IDL, types, .so)
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, PDA structure, extension usage |
| [docs/SSS-1.md](docs/SSS-1.md) | SSS-1 specification details |
| [docs/SSS-2.md](docs/SSS-2.md) | SSS-2 specification details |
| [docs/SDK.md](docs/SDK.md) | TypeScript SDK reference |
| [docs/COMPLIANCE.md](docs/COMPLIANCE.md) | Blacklist, seizure, OFAC integration |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Deployment and operational guide |
| [docs/API.md](docs/API.md) | Backend REST API reference |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and threat analysis |
| [docs/TESTING.md](docs/TESTING.md) | Test suite documentation |
| [docs/PRIVACY.md](docs/PRIVACY.md) | ConfidentialTransfer incompatibility analysis |

## License

MIT
