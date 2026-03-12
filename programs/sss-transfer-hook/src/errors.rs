use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Sender is blacklisted — transfers from this address are blocked")]
    SenderBlacklisted,
    #[msg("Receiver is blacklisted — transfers to this address are blocked")]
    ReceiverBlacklisted,
    #[msg("Token is paused — all transfers are suspended")]
    TokenPaused,
    #[msg("Invalid blacklist entry: account is not owned by hook program")]
    InvalidBlacklistEntry,
    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,
    #[msg("Address is not blacklisted")]
    NotBlacklisted,
    #[msg("Unauthorized: caller is not the config authority or sss-token CPI")]
    Unauthorized,
    #[msg("Token is paused by attestation — reserves are undercollateralized")]
    TokenPausedByAttestation,
}
