use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::AccountFrozen;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{freeze_token_account, require_role_active};

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub freezer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ SSSError::InvalidMint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Freezer as u8], freezer.key().as_ref()],
        bump = freezer_role.bump,
        constraint = freezer_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = freezer_role.assignee == freezer.key() @ SSSError::Unauthorized,
    )]
    pub freezer_role: Account<'info, RoleAssignment>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<FreezeTokenAccount>) -> Result<()> {
    require_role_active(&ctx.accounts.freezer_role, RoleType::Freezer)?;

    // SECURITY NOTE: freeze_account intentionally does NOT check pause status.
    // Freezing is an enforcement action (e.g., responding to fraud, sanctions).
    // Enforcement operations must work even when the token is paused, otherwise
    // pausing could shield bad actors from compliance actions.
    // Same rationale applies to thaw_account and seize.

    require!(
        !ctx.accounts.token_account.is_frozen(),
        SSSError::AccountAlreadyFrozen
    );

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    freeze_token_account(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.token_account.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        signer_seeds,
    )?;

    emit!(AccountFrozen {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}
