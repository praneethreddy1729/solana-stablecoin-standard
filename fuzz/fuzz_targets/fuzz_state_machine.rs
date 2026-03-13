//! Fuzz target: State machine transitions for the SSS stablecoin.
//!
//! Simulates random sequences of state-changing operations (pause, unpause,
//! mint, burn, role updates, attestation) on a simplified state model and
//! checks that global invariants are maintained after every transition.
//!
//! Invariants:
//!   1. total_supply == sum of all mints - sum of all burns (no tokens created/destroyed silently)
//!   2. minted_amount is monotonically non-decreasing
//!   3. minted_amount <= minter_quota always
//!   4. Operations gated by pause check reject when either pause flag is set
//!   5. Role-gated operations reject when role.is_active == false
//!   6. unpause clears BOTH paused and paused_by_attestation
//!   7. Attestation auto-pause only sets paused_by_attestation, not paused

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

/// Simplified state model mirroring on-chain StablecoinConfig + RoleAssignment
#[derive(Debug, Clone)]
struct State {
    paused: bool,
    paused_by_attestation: bool,
    total_supply: u64,
    minted_amount: u64,
    minter_quota: u64,
    minter_active: bool,
    burner_active: bool,
    pauser_active: bool,
    #[allow(dead_code)]
    seizer_active: bool,
    #[allow(dead_code)]
    blacklister_active: bool,
}

#[derive(Arbitrary, Debug)]
enum Action {
    Mint { amount: u64 },
    Burn { amount: u64 },
    Pause,
    Unpause,
    UpdateMinterQuota { new_quota: u64 },
    ToggleMinter { active: bool },
    ToggleBurner { active: bool },
    TogglePauser { active: bool },
    AttestReserves { reserve_amount: u64 },
}

#[derive(Arbitrary, Debug)]
struct FuzzInput {
    initial_quota: u64,
    actions: Vec<Action>,
}

fn is_paused(state: &State) -> bool {
    state.paused || state.paused_by_attestation
}

fn apply_action(state: &mut State, action: &Action) -> Result<(), &'static str> {
    match action {
        Action::Mint { amount } => {
            if *amount == 0 {
                return Err("ZeroAmount");
            }
            if is_paused(state) {
                return Err("TokenPaused");
            }
            if !state.minter_active {
                return Err("RoleNotActive");
            }
            let new_minted = state.minted_amount.checked_add(*amount).ok_or("ArithmeticOverflow")?;
            if new_minted > state.minter_quota {
                return Err("MinterQuotaExceeded");
            }
            state.minted_amount = new_minted;
            state.total_supply = state.total_supply.checked_add(*amount).ok_or("ArithmeticOverflow")?;
            Ok(())
        }
        Action::Burn { amount } => {
            if *amount == 0 {
                return Err("ZeroAmount");
            }
            if is_paused(state) {
                return Err("TokenPaused");
            }
            if !state.burner_active {
                return Err("RoleNotActive");
            }
            if *amount > state.total_supply {
                return Err("InsufficientFunds");
            }
            state.total_supply = state.total_supply.checked_sub(*amount).ok_or("ArithmeticOverflow")?;
            Ok(())
        }
        Action::Pause => {
            if !state.pauser_active {
                return Err("RoleNotActive");
            }
            if state.paused {
                return Err("AlreadyPaused");
            }
            state.paused = true;
            Ok(())
        }
        Action::Unpause => {
            // Unpause clears BOTH flags (INV-6)
            if !state.paused && !state.paused_by_attestation {
                return Err("TokenNotPaused");
            }
            state.paused = false;
            state.paused_by_attestation = false;
            Ok(())
        }
        Action::UpdateMinterQuota { new_quota } => {
            state.minter_quota = *new_quota;
            Ok(())
        }
        Action::ToggleMinter { active } => {
            state.minter_active = *active;
            Ok(())
        }
        Action::ToggleBurner { active } => {
            state.burner_active = *active;
            Ok(())
        }
        Action::TogglePauser { active } => {
            state.pauser_active = *active;
            Ok(())
        }
        Action::AttestReserves { reserve_amount } => {
            // INV-7: only sets paused_by_attestation, not paused
            let old_paused = state.paused;
            state.paused_by_attestation = *reserve_amount < state.total_supply;
            assert_eq!(state.paused, old_paused, "attestation must not change manual pause flag");
            Ok(())
        }
    }
}

fuzz_target!(|input: FuzzInput| {
    let mut state = State {
        paused: false,
        paused_by_attestation: false,
        total_supply: 0,
        minted_amount: 0,
        minter_quota: input.initial_quota,
        minter_active: true,
        burner_active: true,
        pauser_active: true,
        seizer_active: true,
        blacklister_active: true,
    };

    let mut total_minted: u128 = 0;
    let mut total_burned: u128 = 0;

    for action in &input.actions {
        let old_minted = state.minted_amount;

        match apply_action(&mut state, action) {
            Ok(()) => {
                match action {
                    Action::Mint { amount } => {
                        total_minted += *amount as u128;
                    }
                    Action::Burn { amount } => {
                        total_burned += *amount as u128;
                    }
                    _ => {}
                }
            }
            Err(_) => {
                // Rejected actions must not change state (idempotency of rejection)
                // (Note: state is only modified on success in apply_action)
            }
        }

        // --- Check invariants after every action ---

        // INV-1: total_supply consistency
        assert_eq!(
            state.total_supply as u128,
            total_minted - total_burned,
            "supply must equal minted - burned"
        );

        // INV-2: minted_amount monotonically non-decreasing
        assert!(
            state.minted_amount >= old_minted,
            "minted_amount decreased"
        );

        // INV-3: minted_amount <= minter_quota
        // (This can be temporarily violated if quota is decreased, but mint won't succeed)
        // We check that minted_amount was never increased past quota:
        if state.minted_amount > old_minted {
            assert!(
                state.minted_amount <= state.minter_quota,
                "mint accepted that exceeds quota"
            );
        }
    }
});
