use anchor_lang::prelude::*;

#[error_code]
pub enum SSSError {
    #[msg("Unauthorized: signer is not the authority")]
    Unauthorized,
    #[msg("Invalid role type")]
    InvalidRoleType,
    #[msg("Role is not active")]
    RoleNotActive,
    #[msg("Token is paused")]
    TokenPaused,
    #[msg("Token is not paused")]
    TokenNotPaused,
    #[msg("Minter quota exceeded")]
    MinterQuotaExceeded,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid config")]
    InvalidConfig,
    #[msg("Authority transfer not pending")]
    AuthorityTransferNotPending,
    #[msg("Authority transfer already pending")]
    AuthorityTransferAlreadyPending,
    #[msg("Invalid pending authority")]
    InvalidPendingAuthority,
    #[msg("Account is already frozen")]
    AccountAlreadyFrozen,
    #[msg("Account is not frozen")]
    AccountNotFrozen,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid decimals: must be between 0 and 18")]
    InvalidDecimals,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("Symbol too long")]
    SymbolTooLong,
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Account is blacklisted")]
    AccountBlacklisted,
    #[msg("Account is not blacklisted")]
    AccountNotBlacklisted,
    #[msg("Invalid hook program")]
    InvalidHookProgram,
    #[msg("Mint amount must be greater than zero")]
    ZeroAmount,
    #[msg("Compliance module not enabled for this token")]
    ComplianceNotEnabled,
    #[msg("Permanent delegate not enabled for this token")]
    PermanentDelegateNotEnabled,
    #[msg("Blacklist reason too long (max 64 bytes)")]
    ReasonTooLong,
    #[msg("Seized tokens must go to the designated treasury")]
    InvalidTreasury,
    #[msg("Target account owner is not blacklisted")]
    TargetNotBlacklisted,
    #[msg("Account is deliberately frozen and cannot be auto-thawed")]
    AccountDeliberatelyFrozen,
    #[msg("Invalid blacklist entry PDA")]
    InvalidBlacklistEntry,
    #[msg("Invalid from account owner")]
    InvalidFromOwner,
    #[msg("Attestation URI too long (max 256 bytes)")]
    AttestationUriTooLong,
    #[msg("Invalid expiration: must be positive")]
    InvalidExpiration,
    #[msg("Undercollateralized: reserves are below token supply")]
    Undercollateralized,
    #[msg("Cannot freeze the treasury account")]
    CannotFreezeTreasury,
    #[msg("Invalid token program: must be Token-2022")]
    InvalidTokenProgram,
}
