//! Fuzz target: Reserve attestation collateralization ratio arithmetic.
//!
//! Tests that the collateralization ratio computation in attest_reserves never
//! panics, never overflows, and correctly determines the auto-pause condition.
//!
//! Invariants:
//!   1. If token_supply == 0, ratio is always 10_000 (100%)
//!   2. If reserve_amount >= token_supply, auto_paused == false
//!   3. If reserve_amount < token_supply, auto_paused == true
//!   4. The u128 intermediate multiplication never loses precision
//!   5. expires_at = timestamp + expires_in_seconds; overflow caught
//!   6. Ratio is correctly computed as (reserve * 10_000) / supply

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

#[derive(Arbitrary, Debug)]
struct AttestInput {
    reserve_amount: u64,
    token_supply: u64,
    timestamp: i64,
    expires_in_seconds: i64,
}

/// Mirror of attest_reserves collateralization logic from
/// programs/sss-token/src/instructions/attest_reserves.rs
fn compute_collateralization(
    reserve_amount: u64,
    token_supply: u64,
) -> (u64, bool) {
    let ratio = if token_supply == 0 {
        10_000u64
    } else {
        let ratio_128 = (reserve_amount as u128)
            .checked_mul(10_000)
            .unwrap()
            .checked_div(token_supply as u128)
            .unwrap();
        if ratio_128 > u64::MAX as u128 {
            u64::MAX
        } else {
            ratio_128 as u64
        }
    };

    let auto_paused = reserve_amount < token_supply;
    (ratio, auto_paused)
}

/// Mirror of expires_at computation
fn compute_expires_at(timestamp: i64, expires_in_seconds: i64) -> Option<i64> {
    if expires_in_seconds <= 0 {
        return None;
    }
    timestamp.checked_add(expires_in_seconds)
}

fuzz_target!(|input: AttestInput| {
    // --- Collateralization ratio ---
    let (ratio, auto_paused) = compute_collateralization(input.reserve_amount, input.token_supply);

    // INV-1: zero supply => 100%
    if input.token_supply == 0 {
        assert_eq!(ratio, 10_000);
        assert!(!auto_paused);
        return;
    }

    // INV-2 + INV-3: auto-pause correctness
    if input.reserve_amount >= input.token_supply {
        assert!(!auto_paused, "should not auto-pause when fully collateralized");
    } else {
        assert!(auto_paused, "should auto-pause when undercollateralized");
    }

    // INV-6: ratio correctness
    // ratio = (reserve * 10_000) / supply, using u128 intermediary
    let expected_128 = (input.reserve_amount as u128) * 10_000 / (input.token_supply as u128);
    let expected = if expected_128 > u64::MAX as u128 {
        u64::MAX
    } else {
        expected_128 as u64
    };
    assert_eq!(ratio, expected, "ratio mismatch");

    // When fully collateralized, ratio >= 10_000
    if input.reserve_amount >= input.token_supply {
        assert!(ratio >= 10_000, "ratio should be >= 100% when fully collateralized");
    }

    // INV-5: expires_at overflow detection
    if input.expires_in_seconds > 0 {
        let result = compute_expires_at(input.timestamp, input.expires_in_seconds);
        match result {
            Some(expires_at) => {
                assert!(expires_at >= input.timestamp, "expires_at must be >= timestamp");
                // Verify reversibility
                assert_eq!(
                    expires_at - input.timestamp,
                    input.expires_in_seconds,
                    "expires_at - timestamp should equal expires_in_seconds"
                );
            }
            None => {
                // Overflow: timestamp + expires_in must exceed i64::MAX
                assert!(
                    (input.timestamp as i128) + (input.expires_in_seconds as i128) > i64::MAX as i128,
                    "false overflow in expires_at"
                );
            }
        }
    }
});
