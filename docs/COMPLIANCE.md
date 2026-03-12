# Compliance Module

## Overview

The SSS-2 compliance module provides on-chain enforcement of sanctions and AML requirements through three mechanisms:

1. **Transfer Hook Blacklist** -- blocks transfers from or to blacklisted addresses
2. **Permanent Delegate Seizure** -- enables asset recovery from any account
3. **Default Frozen Accounts** -- ensures new accounts cannot receive tokens until approved (optional)

These features are designed to meet regulatory requirements for stablecoins operating in jurisdictions that mandate sanctions screening, asset freezing, and recovery capabilities.

## Blacklist Management

### Architecture

The blacklist is implemented as an existence-based PDA system. Each blacklisted address has a `BlacklistEntry` PDA owned by the transfer hook program (`A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB`). The transfer hook checks for the existence of these PDAs on every transfer.

```
BlacklistEntry PDA
  Seeds: [b"blacklist", mint, user]
  Owner: sss-transfer-hook program
  Size: 77 + reason_len bytes (8 discriminator + 32 mint + 32 user + 4 + reason_len + 1 bump)
  Fields: mint, user, reason (String, max 64 bytes), bump
```

### Adding to Blacklist

The blacklist flow involves a CPI from the main program to the hook program:

1. **Blacklister** calls `sss_token::add_to_blacklist(user, reason)`
2. Main program verifies (via Anchor constraints):
   - `config.enable_transfer_hook == true` (ComplianceNotEnabled)
   - `hook_program.key() == config.hook_program_id` (InvalidHookProgram)
   - Blacklister has an active `RoleAssignment` with `role_type = 4`
3. Main program constructs CPI using pre-computed discriminator `HOOK_ADD_BLACKLIST_DISC`
4. Hook program creates `BlacklistEntry` PDA at `[b"blacklist", mint, user]`
5. Main program emits `AddressBlacklisted` event

### Removing from Blacklist

1. **Blacklister** calls `sss_token::remove_from_blacklist(user)`
2. Same validation as above
3. Main program CPIs using `HOOK_REMOVE_BLACKLIST_DISC`
4. Hook program closes the `BlacklistEntry` PDA (rent returned to blacklister)
5. Main program emits `AddressUnblacklisted` event

### Blacklist Scope

Blacklists are **per-mint**: an address blacklisted for one stablecoin is not automatically blacklisted for another. This allows different issuers to maintain independent sanctions lists. The mint key is part of the PDA seeds, preventing cross-mint spoofing.

### Checking Blacklist Status

Using the SDK:

```typescript
const isBlacklisted = await stablecoin.compliance.isBlacklisted(userPubkey);
// Returns true if BlacklistEntry PDA account exists
```

Using direct PDA derivation:

```typescript
import { findBlacklistPda } from "@stbr/sss-token";

const [blacklistPda] = findBlacklistPda(mintPubkey, userPubkey);
const accountInfo = await connection.getAccountInfo(blacklistPda);
const isBlacklisted = accountInfo !== null;
```

## Seizure Flow

Seizure is the process of forcibly transferring all tokens from an account using the permanent delegate authority. This is typically used after blacklisting an address.

### Recommended Seizure Procedure

1. Compliance officer identifies a sanctioned address (via OFAC screening or other source)
2. Blacklister calls `add_to_blacklist(user)` -- creates BlacklistEntry, blocks future transfers
3. Seizer calls `seize()` -- transfers entire balance from user's ATA to treasury ATA

### Seizure Details

- **Who can seize**: Requires an active Seizer role assignment (RoleType 5)
- **What is seized**: The entire balance of the target token account (`from.amount`)
- **Where tokens go**: To the designated treasury token account (must match `config.treasury`; enforced via `InvalidTreasury` error)
- **Hook bypass**: The permanent delegate transfer bypasses blacklist and pause checks
- **Frozen accounts**: The permanent delegate can transfer from frozen accounts
- **Implementation**: Uses `spl_token_2022::onchain::invoke_transfer_checked` which auto-resolves the transfer hook

### Post-Seizure State

After seizure:
- The source token account has 0 balance but still exists
- The BlacklistEntry PDA still exists (address remains blacklisted)
- The source account may still be frozen
- The `TokensSeized` event provides a full audit trail (mint, from, amount, seizer)

## OFAC Integration Points

The on-chain program does not perform OFAC screening directly. Integration with sanctions lists happens off-chain.

### Backend Sanctions Screening

The backend (`backend/src/services/compliance.ts`) provides a sanctions screening service:

- **Mock mode** (default): Checks against a built-in set of mock sanctioned addresses
- **Production mode**: Calls an external API via `SANCTIONS_API_URL` environment variable

The `/mint` endpoint optionally screens recipients before minting (enabled via `ENABLE_SANCTIONS_SCREENING=true`).

The `/compliance/screen` endpoint provides on-demand screening:

```
POST /compliance/screen
{ "address": "WalletBase58" }
```

Returns:
```json
{
  "address": "WalletBase58",
  "sanctioned": false,
  "timestamp": 1709650000000,
  "source": "mock"
}
```

### Recommended Integration Points

1. **Before minting**: Screen recipient before creating mint transaction
2. **Account creation screening**: Before thawing a default-frozen account, verify against sanctions lists
3. **Periodic batch screening**: Cross-reference all active token holders against updated lists
4. **Real-time monitoring**: Monitor on-chain transfers and screen new addresses

### Audit Trail

All compliance actions emit events that can be indexed for audit purposes:

| Action | Event | Key Fields |
|--------|-------|------------|
| Blacklist address | `AddressBlacklisted` | mint, address, blacklister, reason |
| Unblacklist address | `AddressUnblacklisted` | mint, address, blacklister |
| Seize tokens | `TokensSeized` | mint, from, amount, seizer |
| Freeze account | `AccountFrozen` | mint, account, freezer |
| Thaw account | `AccountThawed` | mint, account, freezer |

The backend also maintains an in-memory audit log of all screening results, accessible via `GET /compliance/audit`.

## Compliance Checklist

For issuers deploying SSS-2 stablecoins:

- [ ] Deploy with `enable_transfer_hook: true`, `enable_permanent_delegate: true`
- [ ] Optionally enable `default_account_frozen: true` for KYC-gated accounts
- [ ] Call `initialize_extra_account_metas` on the hook program after token initialization
- [ ] Assign Blacklister role to compliance team
- [ ] Assign Seizer role to authorized asset recovery personnel
- [ ] Set up OFAC/sanctions screening pipeline (configure `SANCTIONS_API_URL`)
- [ ] Implement KYC verification flow for thawing default-frozen accounts (if enabled)
- [ ] Establish seizure authorization procedures (multi-sig Seizer wallet recommended)
- [ ] Configure event indexing for audit trail
- [ ] Test blacklist and seize flow on devnet before mainnet deployment
- [ ] Document internal procedures for regulatory review
