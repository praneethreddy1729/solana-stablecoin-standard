pub const CONFIG_SEED: &[u8] = b"config";
pub const ROLE_SEED: &[u8] = b"role";

pub const STABLECOIN_CONFIG_SIZE: usize = 8 // discriminator
    + 32  // authority
    + 32  // pending_authority
    + 8   // transfer_initiated_at
    + 32  // mint
    + 32  // hook_program_id
    + 6   // decimals (1) + paused (1) + enable_transfer_hook (1) + enable_permanent_delegate (1) + default_account_frozen (1) + bump (1)
    + 32  // treasury
    + 1   // paused_by_attestation
    + 31; // _reserved

pub const ROLE_ASSIGNMENT_SIZE: usize = 8 // discriminator
    + 32 // config
    + 32 // assignee
    + 1  // role_type
    + 1  // is_active
    + 8  // minter_quota (for Minter role)
    + 8  // minted_amount (cumulative)
    + 1  // bump
    + 64; // _reserved

/// sha256("global:add_to_blacklist")[..8]
pub const HOOK_ADD_BLACKLIST_DISC: [u8; 8] = [90, 115, 98, 231, 173, 119, 117, 176];
/// sha256("global:remove_from_blacklist")[..8]
pub const HOOK_REMOVE_BLACKLIST_DISC: [u8; 8] = [47, 105, 20, 10, 165, 168, 203, 219];

pub const ATTESTATION_SEED: &[u8] = b"attestation";
pub const MAX_ATTESTATION_URI_LEN: usize = 256;

pub const RESERVE_ATTESTATION_SIZE: usize = 8  // discriminator
    + 32  // config
    + 32  // attestor
    + 8   // reserve_amount
    + 8   // token_supply
    + 8   // timestamp
    + 8   // expires_at
    + 4 + MAX_ATTESTATION_URI_LEN // attestation_uri (String = 4-byte len prefix + data)
    + 1   // is_valid
    + 1   // bump
    + 32; // _reserved

pub const REGISTRY_SEED: &[u8] = b"registry";

pub const REGISTRY_ENTRY_SIZE: usize = 8  // discriminator
    + 32  // mint
    + 32  // issuer
    + 1   // compliance_level
    + 8   // created_at
    + 4 + 32  // name (String)
    + 4 + 10  // symbol (String)
    + 1   // decimals
    + 1   // bump
    + 32; // _reserved

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
