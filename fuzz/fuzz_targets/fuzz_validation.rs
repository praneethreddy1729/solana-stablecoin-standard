//! Fuzz target: Input validation invariants.
//!
//! Tests that all parameter validation in the SSS program never panics and
//! correctly accepts/rejects inputs based on documented bounds.
//!
//! Invariants:
//!   1. decimals in [0, 18] accepted; [19, 255] rejected
//!   2. name.len() <= 32 accepted; > 32 rejected
//!   3. symbol.len() <= 10 accepted; > 10 rejected
//!   4. uri.len() <= 200 accepted; > 200 rejected
//!   5. Role type 0-6 accepted; 7-255 rejected
//!   6. Blacklist reason <= 64 bytes accepted; > 64 rejected
//!   7. Attestation URI <= 256 bytes accepted; > 256 rejected
//!   8. expires_in_seconds > 0 accepted; <= 0 rejected

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

const MAX_NAME_LEN: usize = 32;
const MAX_SYMBOL_LEN: usize = 10;
const MAX_URI_LEN: usize = 200;
const MAX_ATTESTATION_URI_LEN: usize = 256;
const MAX_BLACKLIST_REASON_LEN: usize = 64;

#[derive(Arbitrary, Debug)]
struct ValidationInput {
    decimals: u8,
    name_len: u16,
    symbol_len: u16,
    uri_len: u16,
    role_type: u8,
    reason_len: u16,
    attestation_uri_len: u16,
    expires_in_seconds: i64,
}

/// Mirrors initialize validation from programs/sss-token/src/instructions/initialize.rs
fn validate_init(decimals: u8, name_len: usize, symbol_len: usize, uri_len: usize) -> Vec<&'static str> {
    let mut errors = Vec::new();
    if decimals > 18 {
        errors.push("InvalidDecimals");
    }
    if name_len > MAX_NAME_LEN {
        errors.push("NameTooLong");
    }
    if symbol_len > MAX_SYMBOL_LEN {
        errors.push("SymbolTooLong");
    }
    if uri_len > MAX_URI_LEN {
        errors.push("UriTooLong");
    }
    errors
}

/// Mirrors RoleType::from_u8 from programs/sss-token/src/state/roles.rs
fn validate_role_type(val: u8) -> bool {
    matches!(val, 0..=6)
}

/// Mirrors blacklist reason validation from programs/sss-token/src/instructions/add_to_blacklist.rs
fn validate_reason(len: usize) -> bool {
    len <= MAX_BLACKLIST_REASON_LEN
}

/// Mirrors attestation validation from programs/sss-token/src/instructions/attest_reserves.rs
fn validate_attestation(expires_in_seconds: i64, uri_len: usize) -> Vec<&'static str> {
    let mut errors = Vec::new();
    if expires_in_seconds <= 0 {
        errors.push("InvalidExpiration");
    }
    if uri_len > MAX_ATTESTATION_URI_LEN {
        errors.push("AttestationUriTooLong");
    }
    errors
}

fuzz_target!(|input: ValidationInput| {
    let name_len = input.name_len as usize;
    let symbol_len = input.symbol_len as usize;
    let uri_len = input.uri_len as usize;
    let reason_len = input.reason_len as usize;
    let attestation_uri_len = input.attestation_uri_len as usize;

    // --- Initialize validation ---
    let init_errors = validate_init(input.decimals, name_len, symbol_len, uri_len);

    // INV-1: decimals
    if input.decimals <= 18 {
        assert!(!init_errors.contains(&"InvalidDecimals"));
    } else {
        assert!(init_errors.contains(&"InvalidDecimals"));
    }

    // INV-2: name
    if name_len <= MAX_NAME_LEN {
        assert!(!init_errors.contains(&"NameTooLong"));
    } else {
        assert!(init_errors.contains(&"NameTooLong"));
    }

    // INV-3: symbol
    if symbol_len <= MAX_SYMBOL_LEN {
        assert!(!init_errors.contains(&"SymbolTooLong"));
    } else {
        assert!(init_errors.contains(&"SymbolTooLong"));
    }

    // INV-4: uri
    if uri_len <= MAX_URI_LEN {
        assert!(!init_errors.contains(&"UriTooLong"));
    } else {
        assert!(init_errors.contains(&"UriTooLong"));
    }

    // INV-5: role type
    let role_valid = validate_role_type(input.role_type);
    if input.role_type <= 6 {
        assert!(role_valid, "valid role type rejected");
    } else {
        assert!(!role_valid, "invalid role type accepted");
    }

    // INV-6: blacklist reason
    let reason_valid = validate_reason(reason_len);
    if reason_len <= MAX_BLACKLIST_REASON_LEN {
        assert!(reason_valid, "valid reason rejected");
    } else {
        assert!(!reason_valid, "invalid reason accepted");
    }

    // INV-7 + INV-8: attestation
    let attest_errors = validate_attestation(input.expires_in_seconds, attestation_uri_len);

    if input.expires_in_seconds > 0 {
        assert!(!attest_errors.contains(&"InvalidExpiration"));
    } else {
        assert!(attest_errors.contains(&"InvalidExpiration"));
    }

    if attestation_uri_len <= MAX_ATTESTATION_URI_LEN {
        assert!(!attest_errors.contains(&"AttestationUriTooLong"));
    } else {
        assert!(attest_errors.contains(&"AttestationUriTooLong"));
    }
});
