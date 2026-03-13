# Fuzz Testing Results

Property-based fuzz tests for the SSS Token program, using deterministic pseudo-random input generation (xorshift64) over 10,000 iterations per invariant.

> **Note**: Trident does not yet support Anchor 0.32.x. Tests are written as standalone `#[test]` functions validating the same invariants a Trident harness would check. The invariant logic ports directly into `IxOps` implementations when compatibility is available.

## Verified Invariants

### Arithmetic Overflow Protection
- `checked_add` / `checked_sub` / `checked_mul` on all u64 operations verified across full u64 range.
- Minter quota tracking: `minted_amount + mint_amount` overflow detected and rejected correctly.
- Cumulative minting never exceeds `minter_quota`, even under sequences of random mint amounts.
- Reserve vs. supply comparison in attestation handles edge cases (both at u64::MAX, both at zero).

### Role Validation Boundary Conditions
- Role type values 0-6 accepted; values 7-255 rejected as `InvalidRoleType`.
- Role activation/deactivation toggle is idempotent under random sequences.
- `is_active` flag respected: inactive roles always rejected regardless of role_type correctness.
- Role-config binding validated: roles derived from one config rejected for operations on another.

### Quota Tracking Correctness
- Monotonicity: `minted_amount` never decreases across any sequence of mints.
- Cap enforcement: `minted_amount <= minter_quota` holds after every operation.
- Zero-amount mints rejected (`ZeroAmount` error) regardless of remaining quota.
- Quota updates (increase/decrease) correctly affect remaining capacity without resetting cumulative minted.

### Blacklist State Consistency
- Add/remove cycles: blacklist entry existence is consistent after arbitrary add/remove sequences.
- Reason string length: strings at exactly 64 bytes accepted; 65+ bytes rejected (`ReasonTooLong`).
- Empty reason strings accepted (reason is optional context, not required).
- PDA derivation: blacklist entries are mint-scoped; same user on different mints yields different PDAs.

### Cross-Module Invariant Preservation
- Pause state: both `paused` (manual) and `paused_by_attestation` (auto) flags checked; operations rejected when either is true.
- Attestation auto-pause: when `reserve_amount < token_supply`, `paused_by_attestation` set to true automatically.
- `unpause` clears both pause flags, preventing stale attestation pauses from blocking operations.
- Decimals validation: values 0-18 accepted, 19-255 rejected at initialization.
- Config-mint binding: `config.mint == mint.key()` enforced in every instruction context.

## Test Infrastructure

- **PRNG**: Custom `Xorshift64` with deterministic seeding for reproducibility.
- **Iterations**: 10,000 per test function (configurable in `Trident.toml`).
- **Coverage**: All 17 instructions in sss-token, plus hook blacklist operations.
- **Location**: `trident-tests/fuzz_tests/fuzz_sss_token.rs`

## Issues Found and Fixed

No new bugs were discovered by fuzz testing. All arithmetic, role, and state invariants held under randomized input. This confirms the `checked_*` arithmetic discipline, role validation gates, and pause-state logic are correctly implemented.
