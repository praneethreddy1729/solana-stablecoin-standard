use anchor_lang::prelude::*;

pub const BLACKLIST_SEED: &[u8] = b"blacklist";

/// BlacklistEntry PDA — existence means the address is blacklisted
/// Seeds: [b"blacklist", mint.key(), user.key()]
/// Owned by the transfer hook program (NOT the main program)
#[account]
pub struct BlacklistEntry {
    /// The mint this blacklist entry applies to
    pub mint: Pubkey,
    /// The blacklisted user's wallet address
    pub user: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// Reason for blacklisting (e.g., "OFAC match"), max 64 chars
    pub reason: String,
}

impl BlacklistEntry {
    // 8 (discriminator) + 32 (mint) + 32 (user) + 1 (bump) + 4 (string prefix) + 64 (max reason)
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 4 + 64;
}
