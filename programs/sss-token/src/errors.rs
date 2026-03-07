use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Unauthorized: signer is not the authority")]
    Unauthorized, // 6000
    #[msg("Invalid role type")]
    InvalidRoleType, // 6001
    #[msg("Role is not active")]
    RoleNotActive, // 6002
    #[msg("Token is paused")]
    TokenPaused, // 6003
    #[msg("Token is not paused")]
    TokenNotPaused, // 6004
    #[msg("Minter quota exceeded")]
    MinterQuotaExceeded, // 6005
    #[msg("Invalid mint")]
    InvalidMint, // 6006
    #[msg("Invalid config")]
    InvalidConfig, // 6007
    #[msg("Authority transfer not pending")]
    AuthorityTransferNotPending, // 6008
    #[msg("Authority transfer already pending")]
    AuthorityTransferAlreadyPending, // 6009
    #[msg("Invalid pending authority")]
    InvalidPendingAuthority, // 6010
    #[msg("Account is already frozen")]
    AccountAlreadyFrozen, // 6011
    #[msg("Account is not frozen")]
    AccountNotFrozen, // 6012
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow, // 6013
    #[msg("Invalid decimals: must be between 0 and 18")]
    InvalidDecimals, // 6014
    #[msg("Name too long")]
    NameTooLong, // 6015
    #[msg("Symbol too long")]
    SymbolTooLong, // 6016
    #[msg("URI too long")]
    UriTooLong, // 6017
    #[msg("Account is blacklisted")]
    AccountBlacklisted, // 6018
    #[msg("Account is not blacklisted")]
    AccountNotBlacklisted, // 6019
    #[msg("Invalid hook program")]
    InvalidHookProgram, // 6020
    #[msg("Mint amount must be greater than zero")]
    ZeroAmount, // 6021
    #[msg("Compliance module not enabled for this token")]
    ComplianceNotEnabled, // 6022
    #[msg("Permanent delegate not enabled for this token")]
    PermanentDelegateNotEnabled, // 6023
    #[msg("Blacklist reason too long (max 64 bytes)")]
    ReasonTooLong, // 6024
}
