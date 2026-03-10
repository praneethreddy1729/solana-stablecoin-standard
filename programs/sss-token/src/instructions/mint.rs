use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokensMinted;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{mint_tokens, require_not_paused, require_role_active, thaw_token_account};

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ SSSError::InvalidMint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Minter as u8], minter.key().as_ref()],
        bump = minter_role.bump,
        constraint = minter_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = minter_role.assignee == minter.key() @ SSSError::Unauthorized,
    )]
    pub minter_role: Account<'info, RoleAssignment>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The recipient token account (may be frozen if DefaultAccountState is Frozen)
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    #[account(constraint = token_program.key() == anchor_spl::token_2022::ID @ SSSError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);
    require_not_paused(&ctx.accounts.config)?;
    require_role_active(&ctx.accounts.minter_role, RoleType::Minter)?;

    // Check minter quota
    let role = &mut ctx.accounts.minter_role;
    let new_minted = role
        .minted_amount
        .checked_add(amount)
        .ok_or(SSSError::ArithmeticOverflow)?;
    require!(
        new_minted <= role.minter_quota,
        SSSError::MinterQuotaExceeded
    );
    role.minted_amount = new_minted;

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    // Handle frozen accounts when DefaultAccountState is Frozen.
    // SECURITY: Only auto-thaw accounts with zero balance — these are newly-created
    // ATAs that are frozen solely because of the DefaultAccountState extension, not
    // because a Freezer deliberately froze them. If an account has a non-zero balance
    // and is frozen, it was deliberately frozen by a Freezer (enforcement action) and
    // a Minter must NOT be able to bypass that freeze by minting into it.
    if ctx.accounts.config.default_account_frozen && ctx.accounts.to.is_frozen() {
        require!(
            ctx.accounts.to.amount == 0,
            SSSError::AccountDeliberatelyFrozen
        );
        thaw_token_account(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.to.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.config.to_account_info(),
            signer_seeds,
        )?;
    }

    // Mint tokens
    mint_tokens(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.to.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        amount,
        signer_seeds,
    )?;

    emit!(TokensMinted {
        mint: mint_key,
        to: ctx.accounts.to.key(),
        amount,
        minter: ctx.accounts.minter.key(),
    });

    Ok(())
}
