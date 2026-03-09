use anchor_lang::prelude::*;

#[account]
pub struct StablecoinConfig {
    /// The authority who can manage this stablecoin
    pub authority: Pubkey,
    /// Pending authority for two-step transfer
    pub pending_authority: Pubkey,
    /// Timestamp when authority transfer was initiated (0 if none)
    pub transfer_initiated_at: i64,
    /// The mint address of the stablecoin
    pub mint: Pubkey,
    /// The transfer hook program ID (Pubkey::default() if not enabled)
    pub hook_program_id: Pubkey,
    /// Token decimals
    pub decimals: u8,
    /// Whether the token is currently paused
    pub paused: bool,
    /// Whether transfer hook compliance is enabled (SSS-2)
    pub enable_transfer_hook: bool,
    /// Whether permanent delegate is enabled (SSS-2)
    pub enable_permanent_delegate: bool,
    /// Whether default account state is frozen
    pub default_account_frozen: bool,
    /// PDA bump
    pub bump: u8,
    /// Treasury token account — seized tokens are sent here
    pub treasury: Pubkey,
    /// Whether minting is auto-paused due to undercollateralized reserves.
    /// Separate from `paused` so attestor cannot override manual pause,
    /// and pauser cannot silently clear attestation-triggered pause.
    pub paused_by_attestation: bool,
    /// Reserved for future use
    pub _reserved: [u8; 31],
}
