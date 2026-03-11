# SSS-3: Private Stablecoin Specification

> **Status: Experimental / Proof of Concept**
>
> SSS-3 is not implemented. This document describes a potential architecture for
> privacy-preserving stablecoins within the SSS framework. It exists to demonstrate
> that we have analyzed the problem space deeply, not to claim a working solution.

## Overview

SSS-3 defines a "Private Stablecoin" preset that enables confidential transfer amounts
while maintaining regulatory compliance. It uses Token-2022's **ConfidentialTransfer**
extension combined with allowlist-based compliance enforcement -- a fundamentally
different compliance model than SSS-2's transfer hook blacklist.

### Motivation

Regulated stablecoins face a tension between user privacy and compliance obligations.
SSS-2 enforces compliance via a TransferHook that inspects every transfer in real time,
but this architecture is incompatible with encrypted transfer amounts. SSS-3 proposes
an alternative: achieve compliance through account-level controls rather than
transfer-level inspection.

## Token-2022 Incompatibility Analysis

SSS-3 cannot simply add ConfidentialTransfer to SSS-2. The two extensions are
fundamentally at odds:

| Conflict | Details |
|----------|---------|
| **TransferHook + ConfidentialTransfer** | The hook's `amount: u64` parameter receives encrypted data, not the actual transfer amount. Token-2022 provides no mechanism for hooks to access decrypted amounts. |
| **Seize mechanism** | SSS-2's `seize` instruction reads `from.amount` in plaintext to determine the seizure amount. With ConfidentialTransfer, this value is an encrypted ciphertext. |
| **Amount-dependent compliance** | Future compliance features (transfer limits, reporting thresholds, quota enforcement) all require plaintext amounts that ConfidentialTransfer encrypts. |

For the full analysis, see [PRIVACY.md](PRIVACY.md).

## Proposed Architecture

SSS-3 replaces SSS-2's transfer-level enforcement (TransferHook blacklist) with
account-level enforcement (freeze/thaw allowlist). Compliance is achieved before
a transfer occurs, not during it.

### Extensions Used

```
SSS-3 = ConfidentialTransfer + DefaultAccountState(Frozen) + MetadataPointer
```

Notable omissions vs SSS-2:
- **No TransferHook** -- incompatible with ConfidentialTransfer
- **No PermanentDelegate** -- seize cannot read encrypted balances

### Compliance Model: Allowlist via Freeze/Thaw

Instead of blocking bad actors at transfer time (blacklist), SSS-3 blocks everyone
by default and selectively enables known-good actors (allowlist):

1. **DefaultAccountState = Frozen**: Every new token account starts frozen and cannot
   send or receive tokens.

2. **Authority-controlled thaw**: Only addresses that pass KYC/compliance checks are
   thawed by the Freezer role. This is the "allowlist" -- the set of thawed accounts.

3. **Reactive enforcement via FreezeAuthority**: If an address is later flagged
   (sanctions, suspicious activity), the Freezer re-freezes the account, effectively
   removing it from the allowlist. The account can no longer send or receive.

4. **ConfidentialTransfer between thawed accounts**: Once two accounts are both thawed
   (allowlisted), transfers between them use encrypted amounts. The on-chain program
   sees only ciphertexts and zero-knowledge proofs.

### Initialization (Hypothetical)

```rust
InitializeArgs {
    name: "Private USD",
    symbol: "pUSD",
    uri: "https://example.com/pusd.json",
    decimals: 6,
    enable_transfer_hook: false,
    enable_permanent_delegate: false,
    default_account_frozen: true,
    enable_confidential_transfer: true,  // new flag for SSS-3
}
```

### Compliance Flow

```
User requests account  -->  KYC/AML check (off-chain)
                               |
                        Pass?  |  Fail?
                         |          |
                    Thaw account   Reject
                         |
                    User can now send/receive
                    (amounts encrypted via ConfidentialTransfer)
                         |
                    Flagged later?  -->  Freeze account (reactive)
```

## Tradeoffs vs SSS-2

| Dimension | SSS-2 (Blacklist) | SSS-3 (Allowlist) |
|-----------|------------------|------------------|
| **Default access** | Open -- anyone can hold/transfer | Closed -- must be approved first |
| **Privacy** | None -- amounts visible on-chain | Transfer amounts encrypted |
| **Compliance timing** | Real-time (hook checks every transfer) | Pre-approval (thaw) + reactive (re-freeze) |
| **Seize capability** | Yes -- PermanentDelegate reads balance | No -- encrypted balances prevent seizure |
| **Blacklist enforcement** | Per-transfer, both sender and receiver | Account-level freeze only |
| **Transfer cost** | Higher (hook CPI on every transfer) | Higher (ZK proof verification) |
| **Compute units** | ~50-100k CU for hook execution | ~300-400k CU for confidential transfer |
| **Key management** | Standard Solana keypairs | Requires ElGamal keypairs per user |
| **Auditor access** | On-chain amounts visible to anyone | Requires decryption key sharing |
| **Regulatory fit** | Strong -- full amount visibility | Weaker -- regulators need special access |

## Limitations and Open Questions

1. **No seizure mechanism**: Without PermanentDelegate reading plaintext balances,
   there is no on-chain way to forcibly transfer tokens from a frozen account.
   Law enforcement asset recovery would require the authority to burn tokens from
   frozen accounts and re-mint equivalent amounts -- a worse UX and audit trail.

2. **Auditor key escrow**: Regulators examining historical transactions need
   decryption keys. ConfidentialTransfer supports an auditor ElGamal key, but the
   key management and escrow infrastructure does not exist yet.

3. **Compute budget**: ConfidentialTransfer transactions consume 300-400k compute
   units for ZK proof verification, approaching Solana's per-transaction limit.
   This limits composability with other programs in the same transaction.

4. **Allowlist scalability**: Every new user requires an on-chain thaw transaction
   from the Freezer authority. For millions of users, this creates operational
   bottleneck and cost pressure.

5. **No transfer-level compliance**: SSS-3 cannot enforce per-transfer rules
   (amount limits, velocity checks, counterparty restrictions) because the hook
   cannot read amounts. All compliance is binary: you are either allowed to
   transact or you are not.

6. **Selective disclosure complexity**: Sharing decryption keys with specific
   parties (auditors, regulators) for specific time ranges is not natively
   supported by Token-2022's ConfidentialTransfer. Custom infrastructure needed.

## Relationship to SSS-1 and SSS-2

SSS-3 is **not a superset** of SSS-2. It is an alternative compliance model with
a fundamentally different security/privacy tradeoff:

- **SSS-1**: Basic stablecoin, no compliance enforcement
- **SSS-2**: Full compliance via transfer hook blacklist + permanent delegate seizure
- **SSS-3**: Privacy-preserving compliance via confidential transfers + allowlist

An issuer would choose SSS-3 over SSS-2 when user privacy of transfer amounts is a
regulatory or business requirement, and they can accept the loss of real-time
transfer inspection and seizure capabilities.

## References

- [PRIVACY.md](PRIVACY.md) -- ConfidentialTransfer incompatibility analysis
- [Token-2022 ConfidentialTransfer](https://spl.solana.com/token-2022/extensions#confidential-transfers)
- [SSS-2 Specification](SSS-2.md) -- compliance-enabled stablecoin for comparison
