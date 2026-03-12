use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Sender is blacklisted — transfers from this address are blocked")]
    SenderBlacklisted, // 6000
    #[msg("Receiver is blacklisted — transfers to this address are blocked")]
    ReceiverBlacklisted, // 6001
    #[msg("Token is paused — all transfers are suspended")]
    TokenPaused, // 6002
    #[msg("Invalid blacklist entry: account is not owned by hook program")]
    InvalidBlacklistEntry, // 6003
    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted, // 6004
    #[msg("Address is not blacklisted")]
    NotBlacklisted, // 6005
    #[msg("Unauthorized: caller is not the config authority or sss-token CPI")]
    Unauthorized, // 6006
    #[msg("Token is paused by attestation — reserves are undercollateralized")]
    TokenPausedByAttestation, // 6007
}
