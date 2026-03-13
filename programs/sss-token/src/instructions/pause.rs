use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokenPaused;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::require_role_active;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub pauser: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Pauser as u8], pauser.key().as_ref()],
        bump = pauser_role.bump,
        constraint = pauser_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = pauser_role.assignee == pauser.key() @ SSSError::Unauthorized,
    )]
    pub pauser_role: Account<'info, RoleAssignment>,
}

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    require_role_active(&ctx.accounts.pauser_role, RoleType::Pauser)?;
    require!(!ctx.accounts.config.paused, SSSError::TokenPaused);

    ctx.accounts.config.paused = true;

    emit!(TokenPaused {
        mint: ctx.accounts.config.mint,
        pauser: ctx.accounts.pauser.key(),
    });

    Ok(())
}
