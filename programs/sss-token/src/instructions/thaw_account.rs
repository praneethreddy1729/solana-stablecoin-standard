use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::AccountThawed;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{require_role_active, thaw_token_account};

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
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

pub fn handler(ctx: Context<ThawTokenAccount>) -> Result<()> {
    require_role_active(&ctx.accounts.freezer_role, RoleType::Freezer)?;
    require!(
        ctx.accounts.token_account.is_frozen(),
        SSSError::AccountNotFrozen
    );

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    thaw_token_account(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.token_account.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        signer_seeds,
    )?;

    emit!(AccountThawed {
        mint: mint_key,
        account: ctx.accounts.token_account.key(),
        freezer: ctx.accounts.freezer.key(),
    });

    Ok(())
}
