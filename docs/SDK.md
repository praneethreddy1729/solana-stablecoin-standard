# TypeScript SDK Reference

## Overview

The SSS TypeScript SDK provides a high-level interface for interacting with both SSS-1 and SSS-2 stablecoins. It wraps the Anchor-generated client with ergonomic methods, PDA derivation utilities, error code maps, and a `.compliance` sub-object for SSS-2 operations.

Source: `sdk/core/src/`

## Installation

The SDK is consumed as a local package from the monorepo. It depends on:
- `@coral-xyz/anchor`
- `@solana/web3.js`
- `@solana/spl-token`
- `bn.js`

## Core Modules

```
sdk/core/src/
  index.ts             -- Re-exports all public API
  constants.ts         -- Program IDs and PDA seed buffers
  pda.ts               -- PDA derivation functions
  types.ts             -- TypeScript types matching on-chain state
  errors.ts            -- Error code mappings and parser
  SolanaStablecoin.ts  -- Main SDK class
```

## SolanaStablecoin Class

The main entry point. Provides static factory methods and instance methods for all operations.

### Static Methods

#### `SolanaStablecoin.create()`

Create a new stablecoin. Sends the `initialize` transaction on-chain.

```typescript
const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,          // Connection
  {
    name: "TestUSD",
    symbol: "TUSD",
    uri: "https://example.com/tusd.json",
    decimals: 6,
    preset: Preset.SSS_1,  // or Preset.SSS_2, or Preset.Custom
    authority: keypair,     // Keypair (authority signer)
  },
  programId?,          // optional, defaults to SSS_TOKEN_PROGRAM_ID
  hookProgramId?,      // optional, defaults to SSS_TRANSFER_HOOK_PROGRAM_ID
);
```

Preset behavior:
- `Preset.SSS_1`: Forces `enableTransferHook=false`, `enablePermanentDelegate=false`, `defaultAccountFrozen=false`
- `Preset.SSS_2`: Forces `enableTransferHook=true`, `enablePermanentDelegate=true`, `defaultAccountFrozen=false`
- `Preset.Custom`: Uses the individual boolean flags as provided

Returns `{ stablecoin, mintKeypair, txSig }`.

#### `SolanaStablecoin.load()`

Load an existing stablecoin by mint address (no on-chain transaction).

```typescript
const stablecoin = await SolanaStablecoin.load(
  connection,
  wallet,
  mintAddress,       // PublicKey
  programId?,
  hookProgramId?,
);
```

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `program` | `Program` | Anchor program for sss-token |
| `hookProgram` | `Program` | Anchor program for sss-transfer-hook |
| `connection` | `Connection` | Solana connection |
| `mintAddress` | `PublicKey` | Mint address |
| `configPda` | `PublicKey` | Derived config PDA |
| `configBump` | `number` | Config PDA bump |
| `programId` | `PublicKey` | sss-token program ID |
| `hookProgramId` | `PublicKey` | sss-transfer-hook program ID |
| `compliance` | object | SSS-2 compliance methods |

### Instance Methods

#### `getConfig()`

Fetch the on-chain `StablecoinConfig` account.

```typescript
const config: StablecoinConfig = await stablecoin.getConfig();
console.log(config.paused, config.authority.toBase58());
```

#### `mint(to, amount, minter)`

Mint tokens. Caller must have the Minter role.

```typescript
const sig = await stablecoin.mint(
  recipientAta,            // PublicKey of token account
  new BN(1_000_000),       // amount
  minterPubkey,            // PublicKey of minter signer
);
```

#### `burn(from, amount, burner, fromAuthority?)`

Burn tokens. Requires Burner role and token account owner co-sign.

```typescript
const sig = await stablecoin.burn(
  tokenAccount,            // PublicKey of source token account
  new BN(1_000_000),       // amount
  burnerPubkey,            // PublicKey of burner signer
  ownerPubkey,             // optional: PublicKey of token account authority
);
```

#### `freeze(params: FreezeThawParams)`

Freeze a token account.

```typescript
const sig = await stablecoin.freeze({
  tokenAccount: targetAta,
  freezer: freezerPubkey,
});
```

#### `thaw(params: FreezeThawParams)`

Thaw a frozen token account.

```typescript
const sig = await stablecoin.thaw({
  tokenAccount: targetAta,
  freezer: freezerPubkey,
});
```

#### `pause(params: PauseParams)` / `unpause(params: PauseParams)`

```typescript
await stablecoin.pause({ pauser: pauserPubkey });
await stablecoin.unpause({ pauser: pauserPubkey });
```

#### `updateRoles(params: UpdateRolesParams)`

Create or update a role assignment (authority only).

```typescript
await stablecoin.updateRoles({
  roleType: RoleType.Minter,
  assignee: minterPubkey,
  isActive: true,
});
```

#### `updateMinterQuota(params: UpdateMinterQuotaParams)`

Set cumulative minting quota (authority only).

```typescript
await stablecoin.updateMinterQuota({
  minterRole: minterRolePda,  // The RoleAssignment PDA address
  newQuota: new BN(10_000_000_000),
});
```

#### `transferAuthority(newAuthority: PublicKey)`

Initiate two-step authority transfer (current authority only).

```typescript
await stablecoin.transferAuthority(newAuthorityPubkey);
```

#### `acceptAuthority()`

Accept pending authority transfer (pending authority only).

```typescript
await stablecoin.acceptAuthority();
```

#### `cancelAuthorityTransfer()`

Cancel pending authority transfer (current authority only).

```typescript
await stablecoin.cancelAuthorityTransfer();
```

### Compliance Sub-Object (SSS-2)

Accessed via `stablecoin.compliance.*`:

#### `compliance.blacklistAdd(address, blacklister, reason?)`

Add an address to the blacklist via CPI to hook program. The `reason` field (max 64 bytes) is stored on-chain in the BlacklistEntry PDA.

```typescript
await stablecoin.compliance.blacklistAdd(
  addressToBlacklist,      // PublicKey
  blacklisterPubkey,       // PublicKey
  "OFAC SDN List",         // optional reason string
);
```

#### `compliance.blacklistRemove(address, blacklister)`

Remove an address from the blacklist.

```typescript
await stablecoin.compliance.blacklistRemove(
  addressToUnblacklist,    // PublicKey
  blacklisterPubkey,       // PublicKey
);
```

#### `compliance.seize(frozenAccount, treasury)`

Seize all tokens from an account using permanent delegate (requires Seizer role).

```typescript
await stablecoin.compliance.seize(
  sanctionedTokenAccount,  // PublicKey of source token account
  treasuryTokenAccount,    // PublicKey of destination token account
);
```

#### `compliance.isBlacklisted(user: PublicKey)`

Check if an address is blacklisted (checks if BlacklistEntry PDA account exists).

```typescript
const blacklisted: boolean = await stablecoin.compliance.isBlacklisted(userPubkey);
```

## Constants

```typescript
import {
  SSS_TOKEN_PROGRAM_ID,        // tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
  SSS_TRANSFER_HOOK_PROGRAM_ID, // A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB
  TOKEN_2022_PROGRAM_ID,        // Re-exported from @solana/spl-token
  CONFIG_SEED,                  // Buffer.from("config")
  ROLE_SEED,                    // Buffer.from("role")
  BLACKLIST_SEED,               // Buffer.from("blacklist")
  EXTRA_ACCOUNT_METAS_SEED,     // Buffer.from("extra-account-metas")
} from "@stbr/sss-token";
```

## PDA Derivation

### findConfigPda

```typescript
const [configPda, bump] = findConfigPda(mintPublicKey);
// Seeds: [b"config", mint]
// Program: SSS_TOKEN_PROGRAM_ID (default)
```

### findRolePda

```typescript
const [rolePda, bump] = findRolePda(
  configPda,
  RoleType.Minter,  // 0-5
  assigneePublicKey,
);
// Seeds: [b"role", config, role_type_byte, assignee]
// Program: SSS_TOKEN_PROGRAM_ID (default)
```

### findBlacklistPda

```typescript
const [blacklistPda, bump] = findBlacklistPda(mintPublicKey, userPublicKey);
// Seeds: [b"blacklist", mint, user]
// Program: SSS_TRANSFER_HOOK_PROGRAM_ID (default)
```

### findExtraAccountMetasPda

```typescript
const [metasPda, bump] = findExtraAccountMetasPda(mintPublicKey);
// Seeds: [b"extra-account-metas", mint]
// Program: SSS_TRANSFER_HOOK_PROGRAM_ID (default)
```

## Types

### Enums

```typescript
enum RoleType {
  Minter = 0,
  Burner = 1,
  Pauser = 2,
  Freezer = 3,
  Blacklister = 4,
  Seizer = 5,
}

enum Preset {
  SSS_1 = "SSS_1",
  SSS_2 = "SSS_2",
  Custom = "Custom",
}

// Also exported as `Presets` (alias for Preset)
const Presets = Preset;
```

### Account Interfaces

```typescript
interface StablecoinConfig {
  authority: PublicKey;
  pendingAuthority: PublicKey;
  transferInitiatedAt: BN;
  mint: PublicKey;
  hookProgramId: PublicKey;
  decimals: number;
  paused: boolean;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  defaultAccountFrozen: boolean;
  bump: number;
  _reserved: number[];
}

interface RoleAssignment {
  config: PublicKey;
  assignee: PublicKey;
  roleType: number;
  isActive: boolean;
  minterQuota: BN;
  mintedAmount: BN;
  bump: number;
  _reserved: number[];
}

interface BlacklistEntry {
  mint: PublicKey;
  user: PublicKey;
  reason: string;
  bump: number;
}
```

### Parameter Interfaces

```typescript
interface InitializeParams {
  name: string;           // Max 32 chars
  symbol: string;         // Max 10 chars
  uri: string;            // Max 200 chars
  decimals: number;       // 0-18
  preset?: Preset;
  enableTransferHook?: boolean;
  enablePermanentDelegate?: boolean;
  defaultAccountFrozen?: boolean;
}

interface MintParams { amount: BN; to: PublicKey; minter: PublicKey; }
interface BurnParams { amount: BN; from: PublicKey; fromAuthority: PublicKey; burner: PublicKey; }
interface FreezeThawParams { tokenAccount: PublicKey; freezer: PublicKey; }
interface PauseParams { pauser: PublicKey; }
interface BlacklistAddParams { user: PublicKey; blacklister: PublicKey; reason: string; }
interface BlacklistRemoveParams { user: PublicKey; blacklister: PublicKey; }
interface SeizeParams { from: PublicKey; to: PublicKey; }
interface UpdateRolesParams { roleType: RoleType; assignee: PublicKey; isActive: boolean; }
interface UpdateMinterQuotaParams { minterRole: PublicKey; newQuota: BN; }
```

## Error Handling

### Error Code Maps

```typescript
import { SSS_TOKEN_ERRORS, SSS_TRANSFER_HOOK_ERRORS, parseSSSError } from "@stbr/sss-token";

// SSS Token Program errors (6000-6024)
SSS_TOKEN_ERRORS[6003]
// { code: 6003, name: "TokenPaused", msg: "Token is paused" }

// SSS Transfer Hook errors (6000-6006)
SSS_TRANSFER_HOOK_ERRORS[6000]
// { code: 6000, name: "SenderBlacklisted", msg: "Sender is blacklisted" }
```

### parseSSSError

Accepts any error shape (Anchor ProgramError, AnchorError with logs, etc.) and returns an `SSSErrorInfo` or `null`:

```typescript
interface SSSErrorInfo {
  code: number;
  name: string;
  msg: string;
}

const info = parseSSSError(error);
// Checks SSS_TOKEN_ERRORS first, then SSS_TRANSFER_HOOK_ERRORS
```

The parser extracts error codes from:
- `error.code` (number)
- `error.error.errorCode.number`
- `error.message` matching `"Error Number: NNNN"`
- `error.logs[]` matching `"Error Number: NNNN"`

### SSS Token Program Error Codes (6000-6024)

| Code | Name | Message |
|------|------|---------|
| 6000 | Unauthorized | Unauthorized: signer is not the authority |
| 6001 | InvalidRoleType | Invalid role type |
| 6002 | RoleNotActive | Role is not active |
| 6003 | TokenPaused | Token is paused |
| 6004 | TokenNotPaused | Token is not paused |
| 6005 | MinterQuotaExceeded | Minter quota exceeded |
| 6006 | InvalidMint | Invalid mint |
| 6007 | InvalidConfig | Invalid config |
| 6008 | AuthorityTransferNotPending | Authority transfer not pending |
| 6009 | AuthorityTransferAlreadyPending | Authority transfer already pending |
| 6010 | InvalidPendingAuthority | Invalid pending authority |
| 6011 | AccountAlreadyFrozen | Account is already frozen |
| 6012 | AccountNotFrozen | Account is not frozen |
| 6013 | ArithmeticOverflow | Arithmetic overflow |
| 6014 | InvalidDecimals | Invalid decimals: must be between 0 and 18 |
| 6015 | NameTooLong | Name too long |
| 6016 | SymbolTooLong | Symbol too long |
| 6017 | UriTooLong | URI too long |
| 6018 | AccountBlacklisted | Account is blacklisted |
| 6019 | AccountNotBlacklisted | Account is not blacklisted |
| 6020 | InvalidHookProgram | Invalid hook program |
| 6021 | ZeroAmount | Mint amount must be greater than zero |
| 6022 | ComplianceNotEnabled | Compliance module not enabled for this token |
| 6023 | PermanentDelegateNotEnabled | Permanent delegate not enabled for this token |
| 6024 | ReasonTooLong | Blacklist reason exceeds 64 bytes |

### SSS Transfer Hook Error Codes (6000-6006)

| Code | Name | Message |
|------|------|---------|
| 6000 | SenderBlacklisted | Sender is blacklisted |
| 6001 | ReceiverBlacklisted | Receiver is blacklisted |
| 6002 | TokenPaused | Token is paused |
| 6003 | InvalidBlacklistEntry | Invalid blacklist entry |
| 6004 | AlreadyBlacklisted | Already blacklisted |
| 6005 | NotBlacklisted | Not blacklisted |
| 6006 | Unauthorized | Unauthorized |
