# Security Self-Audit Report

**Project:** Solana Stablecoin Standard (SSS)
**Programs:** `sss-token` (tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz), `sss-transfer-hook` (A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB)
**Audit Date:** March 2026
**Auditor:** Internal engineering team
**Scope:** On-chain programs (Anchor/Rust), TypeScript SDK input validation

---

## Methodology

This self-audit was conducted through:

1. **Manual code review** -- Line-by-line review of all 17 instructions in `sss-token` and 5 instructions + fallback in `sss-transfer-hook`, focusing on account validation, access control, and arithmetic safety.
2. **Grep audit** -- Automated pattern scanning for `unwrap()`, `panic!`, `unsafe`, unchecked arithmetic operators (`[^_]+ `, `[^_]- `, `[^_]* `), and missing error variants.
3. **Property-based testing** -- 47 property tests exercising invariants (e.g., "seize always sends to treasury", "blacklisted accounts cannot transfer", "paused token blocks all non-enforcement operations").
4. **Integration testing** -- 395 integration tests covering every instruction path, error branch, and cross-program interaction.
5. **SDK unit testing** -- 173 unit tests validating client-side input sanitization and PDA derivation.

**Tools used:** `cargo clippy` (zero warnings), `cargo fmt` (enforced), custom grep patterns via ripgrep, Anchor test framework on local validator with SIMD-0219 feature deactivated.

## Test Coverage Summary

| Tier | Count | Description |
|------|-------|-------------|
| Integration tests | 395 | Full instruction lifecycle on local validator |
| SDK unit tests | 173 | Input validation, PDA derivation, error mapping |
| Property tests | 47 | Invariant checks across randomized inputs |
| **Total** | **615** | |

---

## Findings

### SSS-SA-001: Seize Destination Not Constrained to Treasury

**Severity:** Critical
**Status:** Fixed

**Description:** The `seize` instruction transfers tokens from a blacklisted account using the permanent delegate. In the initial implementation, the destination `to` account was only constrained to match the mint -- not the treasury. A malicious seizer could pass their own token account as the destination, redirecting seized funds.

**Impact:** A compromised or rogue Seizer role holder could steal all tokens from any blacklisted account by specifying an arbitrary destination.

**Remediation:** Added an Anchor constraint on the `to` account that enforces `to.key() == config.treasury`:

```rust
#[account(
    mut,
    token::mint = mint,
    token::token_program = token_program,
    constraint = to.key() == config.treasury @ SSSError::InvalidTreasury,
)]
pub to: InterfaceAccount<'info, TokenAccount>,
```

**Location:** `programs/sss-token/src/instructions/seize.rs:56-62`

---

### SSS-SA-002: fromOwner Validation Missing in Seize

**Severity:** High
**Status:** Fixed

**Description:** The `seize` instruction accepts `from_owner` as an `UncheckedAccount` to derive the blacklist PDA. Without validation that `from_owner` actually owns the `from` token account, an attacker could pass an arbitrary pubkey as `from_owner`, causing the blacklist PDA derivation to target a different (non-blacklisted) address while seizing tokens from the actual account owner.

**Impact:** Could allow seizure of tokens from non-blacklisted accounts by substituting the `from_owner` input with a blacklisted address that differs from the true token account owner.

**Remediation:** Added explicit ownership validation in the handler before blacklist PDA derivation:

```rust
require!(
    ctx.accounts.from.owner == ctx.accounts.from_owner.key(),
    SSSError::InvalidFromOwner
);
```

**Location:** `programs/sss-token/src/instructions/seize.rs:74-77`

---

### SSS-SA-003: Cross-Program Blacklist PDA Ownership

**Severity:** High
**Status:** Fixed

**Description:** BlacklistEntry PDAs are created by the `sss-transfer-hook` program so the transfer hook can validate them during execution. If these PDAs were owned by the main `sss-token` program instead, the transfer hook could not verify their authenticity -- any program could create an account at the same address with spoofed data.

**Impact:** Without correct program ownership, blacklist enforcement in the transfer hook would be bypassable. An attacker could create fake blacklist entries or prevent legitimate entries from being recognized.

**Remediation:** The `add_to_blacklist` instruction in `sss-token` uses CPI (`invoke_signed`) to create BlacklistEntry accounts under the hook program. The hook program's `execute` handler validates `blacklist_account.owner == crate::ID` before treating an account as a valid blacklist entry.

**Location:** `programs/sss-transfer-hook/src/instructions/execute.rs:72-80`

---

### SSS-SA-004: Checked Arithmetic Throughout

**Severity:** High
**Status:** Fixed

**Description:** Integer overflow in token amount calculations or space computation could lead to incorrect minting quotas, under-funded accounts, or corrupted state. Rust's default release mode does not check for overflow.

**Impact:** Arithmetic overflow in minter quota tracking could allow unlimited minting. Overflow in space calculations during `initialize` could create undersized accounts, leading to runtime panics.

**Remediation:** All arithmetic operations use checked variants:
- Minter quota: `checked_add` for cumulative tracking (`programs/sss-token/src/instructions/mint.rs`)
- Space calculation in `initialize`: chained `checked_add` with `ok_or(SSSError::ArithmeticOverflow)` for metadata TLV layout computation
- Transfer hook extension parsing: `checked_add` for TLV offset advancement to prevent malformed mint data from causing overflow

**Location:** `programs/sss-token/src/instructions/initialize.rs:101-117`, `programs/sss-transfer-hook/src/instructions/execute.rs:214-235`

---

### SSS-SA-005: Treasury Freeze Protection

**Severity:** Medium
**Status:** Fixed

**Description:** The `freeze_account` instruction allows a Freezer role holder to freeze any token account associated with the mint. If the treasury account were frozen, all `seize` operations would fail because Token-2022 rejects `transfer_checked` on frozen source/destination accounts.

**Impact:** A compromised Freezer could freeze the treasury, effectively disabling the seizure mechanism and shielding blacklisted accounts from enforcement.

**Remediation:** Added a guard in `freeze_account` that rejects attempts to freeze the treasury:

```rust
require!(
    ctx.accounts.token_account.key() != ctx.accounts.config.treasury,
    SSSError::CannotFreezeTreasury
);
```

**Location:** `programs/sss-token/src/instructions/freeze_account.rs:55-58`

---

### SSS-SA-006: Permanent Delegate Bypass in Transfer Hook

**Severity:** Medium
**Status:** Mitigated

**Description:** The transfer hook must enforce blacklist restrictions on normal transfers while allowing `seize` operations (which use the permanent delegate) to transfer from blacklisted accounts. Without special handling, seizure would be blocked by the hook's own blacklist check.

**Impact:** Without the bypass, the seize instruction would always fail on blacklisted accounts, rendering the seizure mechanism non-functional.

**Remediation:** The hook's `execute` handler parses the mint's Token-2022 extension data to detect PermanentDelegate transfers. It walks the TLV extension list starting at byte 166, finds extension type 12 (PermanentDelegate), extracts the 32-byte delegate pubkey, and compares it to the `owner_delegate` account. If they match, the hook returns `Ok(())` immediately, bypassing blacklist and pause checks.

The detection uses checked arithmetic for offset advancement to prevent malformed mint data from causing out-of-bounds reads.

**Location:** `programs/sss-transfer-hook/src/instructions/execute.rs:208-239`

---

### SSS-SA-007: Dual Pause Separation

**Severity:** Medium
**Status:** Fixed

**Description:** The system has two pause triggers: manual pause (by Pauser role) and attestation-triggered pause (when reserves drop below token supply). A single `paused` boolean would allow the Attestor to override a manual pause, or the Pauser to clear an attestation pause, creating a conflict of authority.

**Impact:** Without separation, an Attestor submitting a healthy attestation could inadvertently unpause a token that was manually paused for an unrelated security incident.

**Remediation:** Two separate boolean fields in `StablecoinConfig`: `paused` (manual) and `paused_by_attestation` (reserve-triggered). The `require_not_paused` utility checks both:

```rust
pub fn require_not_paused(config: &StablecoinConfig) -> Result<()> {
    require!(!config.paused, SSSError::TokenPaused);
    require!(!config.paused_by_attestation, SSSError::Undercollateralized);
    Ok(())
}
```

Enforcement actions (freeze, thaw, seize) intentionally skip pause checks so compliance operations remain functional during a pause.

**Location:** `programs/sss-token/src/utils/validation.rs:6-10`

---

### SSS-SA-008: SSS-2 Graceful Degradation on SSS-1 Tokens

**Severity:** Low
**Status:** Fixed

**Description:** SSS-2 compliance instructions (blacklist, seize) could be invoked against SSS-1 tokens that lack the necessary extensions (TransferHook, PermanentDelegate). Without explicit checks, these calls would fail with cryptic PDA derivation errors or unexpected program behavior.

**Impact:** Poor error messages would confuse integrators. In the worst case, partial execution before failure could leave inconsistent state.

**Remediation:** Feature flag checks at the top of each SSS-2 instruction handler:
- `require_permanent_delegate_enabled()` returns `SSSError::PermanentDelegateNotEnabled`
- Compliance-gated instructions check `config.hook_program_id != Pubkey::default()` and return `SSSError::ComplianceNotEnabled`

**Location:** `programs/sss-token/src/utils/validation.rs:23-29`

---

### SSS-SA-009: Blacklist Reason Length Validation

**Severity:** Low
**Status:** Fixed

**Description:** The `add_to_blacklist` instruction accepts a `reason` string stored in the BlacklistEntry account. Without length validation, an attacker with the Blacklister role could pass arbitrarily large strings, inflating account size and rent cost.

**Impact:** Rent cost inflation. While bounded by transaction size limits, explicit validation provides a tighter guarantee and clearer error messaging.

**Remediation:** Reason string capped at 64 bytes with `SSSError::ReasonTooLong` error.

**Location:** `programs/sss-token/src/errors.rs:53-54`

---

### SSS-SA-010: No unwrap()/panic!/unsafe in Program Code

**Severity:** Informational
**Status:** Verified

**Description:** Grep audit of both program crates (`sss-token`, `sss-transfer-hook`) confirms zero instances of `unwrap()`, `panic!`, or `unsafe` in production code. All fallible operations use the `?` operator or `ok_or(SSSError::...)` patterns.

**Impact:** N/A -- this is a positive finding confirming absence of panic-inducing patterns.

**Verification:** `rg "unwrap\(\)|panic!|unsafe " programs/` returns zero matches in `.rs` files (excluding test code and Anchor-generated boilerplate).

---

### SSS-SA-011: Config PDA as Mint and Freeze Authority

**Severity:** Informational
**Status:** By Design

**Description:** The Config PDA serves as both the mint authority and freeze authority for the Token-2022 mint. With `DefaultAccountState(Frozen)` enabled, all new ATAs start frozen. The `mint` instruction must atomically thaw the destination before minting.

**Impact:** This is a deliberate design choice. Consolidating both authorities in the Config PDA eliminates the need for a separate freeze authority key, simplifying the trust model. The PDA cannot sign external transactions, so authority cannot be extracted.

**Location:** `programs/sss-token/src/instructions/initialize.rs:181-190`

---

### SSS-SA-012: Token-2022 Extension Initialization Order

**Severity:** Informational
**Status:** By Design

**Description:** Token-2022 requires extensions to be initialized in a specific order before `initializeMint`, and metadata to be initialized after. The order is: MetadataPointer, PermanentDelegate, TransferHook, DefaultAccountState, InitializeMint, TokenMetadata.

**Impact:** Incorrect ordering causes Token-2022 to reject the transaction. This is enforced by the program's instruction sequencing in the `initialize` handler.

**Location:** `programs/sss-token/src/instructions/initialize.rs:80-214`

---

## Summary

| Severity | Count | Fixed | Mitigated | By Design | Verified |
|----------|-------|-------|-----------|-----------|----------|
| Critical | 1 | 1 | 0 | 0 | 0 |
| High | 3 | 3 | 0 | 0 | 0 |
| Medium | 3 | 2 | 1 | 0 | 0 |
| Low | 2 | 2 | 0 | 0 | 0 |
| Informational | 3 | 0 | 0 | 2 | 1 |
| **Total** | **12** | **8** | **1** | **2** | **1** |

All Critical and High findings have been remediated. The one Mitigated finding (SSS-SA-006) is an inherent design tradeoff of the permanent delegate mechanism, addressed through careful extension data parsing with bounds-checked arithmetic.

## Disclaimer

This is a self-audit conducted by the development team and does not constitute a formal third-party security audit. It documents security-relevant decisions, identified vulnerabilities, and their remediations. A professional audit by an independent firm is recommended before mainnet deployment with significant TVL.
