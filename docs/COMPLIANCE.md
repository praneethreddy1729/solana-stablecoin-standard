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

---

## GENIUS Act Compliance

The GENIUS Act (Guiding and Establishing National Innovation for US Stablecoins Act) is US federal legislation establishing a regulatory framework for payment stablecoins. This section maps GENIUS Act requirements to the technical features provided by SSS.

**Disclaimer**: SSS provides on-chain infrastructure that *supports* compliance. Legal and regulatory obligations (licensing, corporate governance, legal opinions, etc.) remain the sole responsibility of the issuer. This mapping is informational, not legal advice.

### Requirement-to-Feature Mapping

| # | GENIUS Act Requirement | SSS Feature | Details |
|---|------------------------|-------------|---------|
| 1 | **1:1 Reserve Backing** — Reserves in high-quality liquid assets (US Treasuries, cash, central bank deposits, repo agreements) must equal outstanding tokens at all times | `attest_reserves` instruction + auto-pause | The `attest_reserves` instruction records `reserve_amount` vs. live `mint.supply` on-chain. If `reserve_amount < token_supply`, the program automatically sets `paused_by_attestation = true`, halting all mints and transfers until reserves are restored. The `ReserveAttestation` PDA stores reserve amount, supply snapshot, timestamp, and expiration. Issuers must ensure off-chain reserves match the attested amount. |
| 2 | **Regular Reserve Attestation** — Monthly attestation by a registered public accounting firm | `attest_reserves` + Attestor role (RoleType 6) | An authorized Attestor (assigned via `update_roles`) calls `attest_reserves(reserve_amount, expires_in_seconds, attestation_uri)`. The `attestation_uri` field links to the accounting firm's signed report. The `expires_at` timestamp enforces attestation freshness — issuers can set 30-day expiry to match the monthly cadence. The `ReservesAttested` event provides an immutable audit trail. |
| 3 | **Redemption Rights** — Holders must be able to redeem at par value | `mint` / `burn` architecture with Minter and Burner roles | The `burn` instruction allows authorized Burners (RoleType 1) to destroy tokens, enabling the issuer to implement a redemption flow: user requests redemption, issuer burns tokens from the user's account and transfers fiat off-chain. Minter quotas (`update_minter`) control issuance. The config PDA as mint authority ensures only the program can mint. |
| 4 | **Issuer Registration** — >$10B: Fed-regulated; <$10B: state-regulated with OCC option | `RegistryEntry` PDA + `compliance_level` field | Each stablecoin's `RegistryEntry` (seeds: `[b"registry", mint]`) records issuer pubkey, compliance level (1 or 2), name, symbol, and creation timestamp. This on-chain registry enables programmatic discovery via `getProgramAccounts`. The `compliance_level` field can distinguish regulatory tiers. Registration is immutable once created during `initialize`. |
| 5 | **Consumer Protection** — Segregated reserves, priority claim in bankruptcy | Treasury account separation + `update_treasury` | SSS enforces a dedicated treasury account (`config.treasury`) separate from the issuer's operational accounts. Seized tokens flow to this treasury. The `update_treasury` instruction allows the authority to update the treasury address (e.g., to a new custodian). Reserve segregation is an off-chain legal obligation, but the on-chain treasury separation provides verifiable accounting. |
| 6 | **AML/KYC/Sanctions Compliance** — BSA requirements apply | Transfer hook blacklist + permanent delegate seizure + default-frozen accounts + backend compliance service | **Blacklist**: `add_to_blacklist` / `remove_from_blacklist` block transfers to/from sanctioned addresses via the transfer hook (checked on every transfer). **Seizure**: `seize` uses the permanent delegate to forcibly recover tokens from any account to treasury. **KYC gating**: `default_account_frozen: true` ensures new accounts cannot transact until explicitly thawed after KYC. **Screening**: Backend `/compliance/screen` endpoint integrates with external sanctions APIs. |
| 7 | **Transparency** — Public disclosure of reserve composition | `attestation_uri` field in `ReserveAttestation` | The `attestation_uri` (max 256 bytes) links to a publicly accessible proof-of-reserves document (e.g., an IPFS hash, Arweave TX, or HTTPS URL to the accounting firm's report). The on-chain `ReserveAttestation` PDA stores `reserve_amount`, `token_supply`, and `collateralization_ratio_bps` — all publicly readable. The `ReservesAttested` event is indexable by explorers. |
| 8 | **Prohibition on Unauthorized Issuance** — Only permitted entities may issue payment stablecoins | Authority + Minter role + quota system | Only the authority can assign Minter roles via `update_roles`. Each Minter has a quota (`allowance`) set by the authority via `update_minter`. Minting deducts from the quota; exceeding it fails with `ExceedsMinterAllowance`. The config PDA is the sole mint authority on the Token-2022 mint — no external party can mint without a valid Minter role assignment. |

### Auto-Pause Mechanism

The GENIUS Act's reserve backing requirement (Section 1 above) is actively enforced on-chain through the auto-pause mechanism:

1. Attestor calls `attest_reserves(reserve_amount, expires_in_seconds, attestation_uri)`
2. The instruction reads live `mint.supply` from the Token-2022 mint account
3. If `reserve_amount < token_supply`: sets `config.paused_by_attestation = true`
4. If `reserve_amount >= token_supply`: sets `config.paused_by_attestation = false`
5. All state-changing instructions (mint, burn, transfer via hook) check `require_not_paused`, which evaluates **both** `config.paused` (manual) and `config.paused_by_attestation` (attestation-triggered)

This separation means:
- A manual `pause` by a Pauser does not interfere with attestation state
- An attestation-triggered pause cannot be cleared by calling `unpause` alone — reserves must be restored first via a new `attest_reserves` call
- The authority's `unpause` instruction clears **both** flags, serving as an emergency override

### SSS-1 vs SSS-2: Regulatory Tier Mapping

SSS defines two compliance levels, set at initialization and recorded in the `RegistryEntry`:

| Feature | SSS-1 (Basic) | SSS-2 (Full Compliance) |
|---------|---------------|-------------------------|
| `enable_transfer_hook` | `false` | `true` |
| `enable_permanent_delegate` | `false` | `true` |
| `default_account_frozen` | `false` | Issuer's choice |
| Blacklist enforcement | Not available | Per-transfer hook check |
| Seizure capability | Not available | Permanent delegate transfer |
| KYC-gated accounts | Not available | Default-frozen + thaw flow |
| Reserve attestation | Available | Available |
| Minter quotas | Available | Available |
| Registry entry | `compliance_level: 1` | `compliance_level: 2` |

**GENIUS Act alignment**:
- **SSS-2** is the appropriate level for payment stablecoins subject to the GENIUS Act. It provides the AML/sanctions enforcement (requirement 6), seizure capability for law enforcement cooperation, and KYC gating that regulated issuers need.
- **SSS-1** is suitable for stablecoins operating in lighter-touch jurisdictions or during early-stage development, where transfer-level compliance enforcement is not yet required. SSS-1 tokens still benefit from reserve attestation, minter controls, and registry discoverability.

### International Regulatory Context

#### Brazil — BCB Resolution 97/2024

This bounty is hosted by Superteam Brazil. Brazil's Central Bank (BCB) Resolution 97/2024 establishes a regulatory framework for virtual asset service providers (VASPs) and stablecoins (referred to as "stablecoins lastreadas em moeda estrangeira"):

- **Authorization requirement**: Entities issuing or intermediating foreign-currency-denominated stablecoins in Brazil must obtain BCB authorization.
- **Segregation of assets**: Client assets must be segregated from the issuer's own assets — supported by SSS's treasury separation and reserve attestation.
- **AML/CFT obligations**: VASPs must implement KYC and transaction monitoring — supported by SSS-2's transfer hook blacklist, default-frozen accounts, and backend sanctions screening.
- **Operational requirements**: BCB mandates internal controls, risk management, and audit trails — supported by SSS's role-based access control (7 role types with on-chain assignment/revocation events) and comprehensive event emission for audit indexing.

SSS-2 provides the technical infrastructure Brazilian issuers need to meet BCB Resolution 97/2024 requirements. The `RegistryEntry` PDA enables the BCB or auditors to programmatically enumerate all SSS stablecoins on Solana.

#### European Union — Markets in Crypto-Assets (MiCA)

MiCA (Regulation (EU) 2023/1114) classifies stablecoins as either Asset-Referenced Tokens (ARTs) or E-Money Tokens (EMTs) and imposes requirements that overlap with SSS capabilities:

- **Reserve requirements (Art. 36)**: EMT issuers must maintain reserves of at least the outstanding token value in secure, low-risk assets — directly supported by `attest_reserves` and auto-pause.
- **Redemption rights (Art. 39)**: Holders must be able to redeem at par at any time — supported by the burn/redemption architecture.
- **Orderly wind-down (Art. 47)**: Plans for ceasing operations — the `pause` instruction can halt all activity; `seize` can recover outstanding tokens.
- **AML obligations (per AMLD/AMLR)**: Sanctions screening and transaction monitoring — supported by SSS-2's transfer hook and blacklist.
- **Significant EMTs (>5M holders or >5B EUR outstanding)**: Subject to enhanced prudential requirements — SSS-2's full compliance feature set (transfer hook + permanent delegate + default frozen) maps to this higher tier.

### Integration Recommendations for GENIUS Act Compliance

For issuers targeting GENIUS Act compliance with SSS:

- [ ] Deploy as SSS-2 (`enable_transfer_hook: true`, `enable_permanent_delegate: true`)
- [ ] Enable `default_account_frozen: true` for KYC-gated onboarding
- [ ] Assign Attestor role to a keypair controlled by or auditable by the registered public accounting firm
- [ ] Configure `attest_reserves` with `expires_in_seconds` of 2,592,000 (30 days) to enforce monthly attestation cadence
- [ ] Set `attestation_uri` to a publicly accessible, content-addressed document (IPFS/Arweave preferred for immutability)
- [ ] Implement off-chain redemption flow: user requests redemption -> Burner burns tokens -> issuer transfers fiat
- [ ] Connect backend sanctions screening to OFAC SDN list (via `SANCTIONS_API_URL`)
- [ ] Establish multi-sig governance for authority key (e.g., Squads multisig)
- [ ] Maintain reserve assets in qualifying instruments per GENIUS Act Section 4 (US Treasuries <= 93 days, insured deposits, central bank reserves, qualifying repo agreements)
- [ ] Engage legal counsel to ensure corporate structure meets issuer registration requirements (federal vs. state pathway)
