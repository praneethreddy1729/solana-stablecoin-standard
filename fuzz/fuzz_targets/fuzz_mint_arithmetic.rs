//! Fuzz target: Mint quota arithmetic invariants.
//!
//! Tests that the mint instruction's checked arithmetic and quota enforcement
//! never allows total minted to exceed quota, and never panics on any input.
//!
//! Invariants:
//!   1. minted_amount + amount must not overflow u64
//!   2. minted_amount + amount <= minter_quota always enforced
//!   3. Zero-amount mints are always rejected
//!   4. After N sequential mints, cumulative == sum of accepted amounts

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

/// Simulates the mint instruction's quota-tracking logic extracted from
/// `programs/sss-token/src/instructions/mint.rs`.
#[derive(Arbitrary, Debug)]
struct MintSequence {
    /// Initial minter quota
    quota: u64,
    /// Initial minted_amount (could be non-zero from prior mints)
    initial_minted: u64,
    /// Sequence of mint amounts to attempt
    amounts: Vec<u64>,
}

/// Mirror of the quota check in mint::handler
fn try_mint(minted_amount: u64, amount: u64, quota: u64) -> Result<u64, &'static str> {
    if amount == 0 {
        return Err("ZeroAmount");
    }
    let new_minted = minted_amount.checked_add(amount).ok_or("ArithmeticOverflow")?;
    if new_minted > quota {
        return Err("MinterQuotaExceeded");
    }
    Ok(new_minted)
}

fuzz_target!(|input: MintSequence| {
    // Skip degenerate case where initial state already violates invariant
    if input.initial_minted > input.quota {
        return;
    }

    let mut minted = input.initial_minted;
    let mut cumulative_accepted: u128 = input.initial_minted as u128;

    for &amount in &input.amounts {
        match try_mint(minted, amount, input.quota) {
            Ok(new_minted) => {
                // INV-1: No overflow occurred (checked_add succeeded)
                assert!(new_minted >= minted, "minted_amount must be monotonically increasing");

                // INV-2: Quota never exceeded
                assert!(new_minted <= input.quota, "minted_amount must not exceed quota");

                // INV-4: Cumulative tracking
                cumulative_accepted += amount as u128;
                assert_eq!(new_minted as u128, cumulative_accepted, "cumulative mismatch");

                minted = new_minted;
            }
            Err("ZeroAmount") => {
                // INV-3: Zero amounts always rejected
                assert_eq!(amount, 0);
            }
            Err("ArithmeticOverflow") => {
                // Overflow correctly caught — minted + amount > u64::MAX
                assert!(
                    (minted as u128) + (amount as u128) > u64::MAX as u128,
                    "false overflow"
                );
            }
            Err("MinterQuotaExceeded") => {
                // Quota exceeded — verify the math
                let would_be = minted.checked_add(amount);
                match would_be {
                    Some(v) => assert!(v > input.quota, "false quota rejection"),
                    None => {} // overflow also caught here, fine
                }
            }
            _ => unreachable!(),
        }
    }

    // Final invariant: minted never exceeds quota
    assert!(minted <= input.quota);
});
