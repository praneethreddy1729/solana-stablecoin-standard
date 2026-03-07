use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Sender is blacklisted")]
    SenderBlacklisted, // 6000
    #[msg("Receiver is blacklisted")]
    ReceiverBlacklisted, // 6001
    #[msg("Token is paused")]
    TokenPaused, // 6002
    #[msg("Invalid blacklist entry")]
    InvalidBlacklistEntry, // 6003
    #[msg("Already blacklisted")]
    AlreadyBlacklisted, // 6004
    #[msg("Not blacklisted")]
    NotBlacklisted, // 6005
    #[msg("Unauthorized")]
    Unauthorized, // 6006
}
