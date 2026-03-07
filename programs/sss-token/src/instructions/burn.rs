use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokensBurned;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{require_not_paused, require_role_active};

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ SSSError::InvalidMint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Burner as u8], burner.key().as_ref()],
        bump = burner_role.bump,
        constraint = burner_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = burner_role.assignee == burner.key() @ SSSError::Unauthorized,
    )]
    pub burner_role: Account<'info, RoleAssignment>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: The owner of the token account must sign or delegate
    pub from_authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, SSSError::ZeroAmount);
    require_not_paused(&ctx.accounts.config)?;
    require_role_active(&ctx.accounts.burner_role, RoleType::Burner)?;

    let mint_key = ctx.accounts.mint.key();

    // Burn using the from_authority signer directly (not PDA)
    let cpi_accounts = token_2022::Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.from.to_account_info(),
        authority: ctx.accounts.from_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_2022::burn(cpi_ctx, amount)?;

    emit!(TokensBurned {
        mint: mint_key,
        from: ctx.accounts.from.key(),
        amount,
        burner: ctx.accounts.burner.key(),
    });

    Ok(())
}
