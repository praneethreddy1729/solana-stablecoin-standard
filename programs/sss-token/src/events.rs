use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub decimals: u8,
    pub name: String,
    pub symbol: String,
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub default_account_frozen: bool,
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub minter: Pubkey,
}

#[event]
pub struct TokensBurned {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub burner: Pubkey,
}

#[event]
pub struct AccountFrozen {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub mint: Pubkey,
    pub account: Pubkey,
    pub freezer: Pubkey,
}

#[event]
pub struct TokenPaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct TokenUnpaused {
    pub mint: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct RoleUpdated {
    pub config: Pubkey,
    pub assignee: Pubkey,
    pub role_type: u8,
    pub is_active: bool,
}

#[event]
pub struct MinterQuotaUpdated {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub new_quota: u64,
}

#[event]
pub struct AuthorityTransferInitiated {
    pub config: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferAccepted {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferCancelled {
    pub config: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct AddressBlacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
    pub reason: String,
}

#[event]
pub struct AddressUnblacklisted {
    pub mint: Pubkey,
    pub address: Pubkey,
    pub blacklister: Pubkey,
}

#[event]
pub struct TokensSeized {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seizer: Pubkey,
}
