use crate::errors::SSSError;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use anchor_lang::prelude::*;

/// Require that the token is NOT paused (neither manually nor by attestation)
pub fn require_not_paused(config: &StablecoinConfig) -> Result<()> {
    require!(!config.paused, SSSError::TokenPaused);
    require!(!config.paused_by_attestation, SSSError::Undercollateralized);
    Ok(())
}

/// Require that the signer is the authority
pub fn require_authority(config: &StablecoinConfig, signer: &Pubkey) -> Result<()> {
    require!(config.authority == *signer, SSSError::Unauthorized);
    Ok(())
}

/// Require that the role is active and matches the expected type
pub fn require_role_active(role: &RoleAssignment, expected: RoleType) -> Result<()> {
    require!(role.role_type == expected as u8, SSSError::InvalidRoleType);
    require!(role.is_active, SSSError::RoleNotActive);
    Ok(())
}

/// Require that permanent delegate is enabled
pub fn require_permanent_delegate_enabled(config: &StablecoinConfig) -> Result<()> {
    require!(
        config.enable_permanent_delegate,
        SSSError::PermanentDelegateNotEnabled
    );
    Ok(())
}
