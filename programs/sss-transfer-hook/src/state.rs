use anchor_lang::prelude::*;

pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// Seeds: [b"blacklist", mint, user] — existence means the address is blacklisted.
/// Owned by the transfer hook program (NOT the main program).
#[account]
pub struct BlacklistEntry {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub bump: u8,
    /// e.g., "OFAC match", max 64 chars
    pub reason: String,
}

impl BlacklistEntry {
    // 8 (discriminator) + 32 (mint) + 32 (user) + 1 (bump) + 4 (string prefix) + 64 (max reason)
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 4 + 64;
}
