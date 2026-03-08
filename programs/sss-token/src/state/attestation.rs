use anchor_lang::prelude::*;

#[account]
pub struct ReserveAttestation {
    /// The stablecoin config this attestation belongs to
    pub config: Pubkey,
    /// The attestor who submitted this attestation
    pub attestor: Pubkey,
    /// Reserve balance in token base units
    pub reserve_amount: u64,
    /// Token supply at time of attestation
    pub token_supply: u64,
    /// Unix timestamp when attestation was made
    pub timestamp: i64,
    /// Unix timestamp when this attestation expires
    pub expires_at: i64,
    /// Link to off-chain proof document (e.g., audit report URL)
    pub attestation_uri: String,
    /// Whether this attestation is still valid (can be invalidated)
    pub is_valid: bool,
    /// PDA bump
    pub bump: u8,
}
