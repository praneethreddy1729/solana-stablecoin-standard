use anchor_lang::prelude::*;

#[account]
pub struct ReserveAttestation {
    pub config: Pubkey,
    pub attestor: Pubkey,
    pub reserve_amount: u64,
    pub token_supply: u64,
    pub timestamp: i64,
    pub expires_at: i64,
    /// Off-chain proof document (e.g., audit report URL)
    pub attestation_uri: String,
    pub is_valid: bool,
    pub bump: u8,
    pub _reserved: [u8; 32],
}
