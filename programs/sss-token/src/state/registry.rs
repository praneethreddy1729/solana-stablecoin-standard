use anchor_lang::prelude::*;

#[account]
pub struct RegistryEntry {
    pub mint: Pubkey,
    /// Authority at creation time
    pub issuer: Pubkey,
    /// 1 = SSS-1 (basic), 2 = SSS-2 (compliance)
    pub compliance_level: u8,
    pub created_at: i64,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub bump: u8,
    pub _reserved: [u8; 32],
}
