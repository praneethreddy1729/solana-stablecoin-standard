use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::MinterQuotaUpdated;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::require_authority;

#[derive(Accounts)]
pub struct UpdateMinterQuota<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Minter as u8], minter_role.assignee.as_ref()],
        bump = minter_role.bump,
        constraint = minter_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = minter_role.role_type == RoleType::Minter as u8 @ SSSError::InvalidRoleType,
    )]
    pub minter_role: Account<'info, RoleAssignment>,
}

pub fn handler(ctx: Context<UpdateMinterQuota>, new_quota: u64) -> Result<()> {
    require_authority(&ctx.accounts.config, &ctx.accounts.authority.key())?;

    ctx.accounts.minter_role.minter_quota = new_quota;

    emit!(MinterQuotaUpdated {
        config: ctx.accounts.config.key(),
        minter: ctx.accounts.minter_role.assignee,
        new_quota,
    });

    Ok(())
}
