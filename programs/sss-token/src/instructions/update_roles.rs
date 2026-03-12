use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::RoleUpdated;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::require_authority;

#[derive(Accounts)]
#[instruction(role_type: u8, assignee: Pubkey)]
pub struct UpdateRoles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = ROLE_ASSIGNMENT_SIZE,
        seeds = [ROLE_SEED, config.key().as_ref(), &[role_type], assignee.as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateRoles>,
    role_type: u8,
    assignee: Pubkey,
    is_active: bool,
) -> Result<()> {
    require_authority(&ctx.accounts.config, &ctx.accounts.authority.key())?;

    RoleType::from_u8(role_type).ok_or(SSSError::InvalidRoleType)?;

    let role = &mut ctx.accounts.role;
    role.config = ctx.accounts.config.key();
    role.assignee = assignee;
    role.role_type = role_type;
    role.is_active = is_active;
    role.bump = ctx.bumps.role;

    emit!(RoleUpdated {
        config: ctx.accounts.config.key(),
        assignee,
        role_type,
        is_active,
    });

    Ok(())
}
