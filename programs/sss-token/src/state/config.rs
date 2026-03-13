use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    pub authority: Pubkey,
    /// Pending authority for two-step transfer
    pub pending_authority: Pubkey,
    /// 0 if no transfer pending
    pub transfer_initiated_at: i64,
    pub mint: Pubkey,
    /// Pubkey::default() if transfer hook not enabled
    pub hook_program_id: Pubkey,
    pub decimals: u8,
    pub paused: bool,
    /// SSS-2 feature flags
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub default_account_frozen: bool,
    pub bump: u8,
    /// Seized tokens are sent here
    pub treasury: Pubkey,
    /// Separate from `paused` so attestor cannot override manual pause,
    /// and pauser cannot silently clear attestation-triggered pause.
    pub paused_by_attestation: bool,
    pub _reserved: [u8; 31],
}
