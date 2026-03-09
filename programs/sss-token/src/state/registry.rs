use anchor_lang::prelude::*;

#[account]
pub struct RegistryEntry {
    /// The stablecoin mint address
    pub mint: Pubkey,
    /// The issuer (authority at creation time)
    pub issuer: Pubkey,
    /// SSS compliance level: 1 = SSS-1 (basic), 2 = SSS-2 (compliance)
    pub compliance_level: u8,
    /// Creation timestamp
    pub created_at: i64,
    /// Token name (copied from init args, max 32 bytes)
    pub name: String,
    /// Token symbol (copied from init args, max 10 bytes)
    pub symbol: String,
    /// Token decimals
    pub decimals: u8,
    /// PDA bump
    pub bump: u8,
}
