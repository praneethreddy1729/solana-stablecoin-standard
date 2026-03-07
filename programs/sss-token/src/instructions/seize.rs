use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokensSeized;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{require_permanent_delegate_enabled, require_role_active};

#[derive(Accounts)]
pub struct Seize<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump = config.bump,
        has_one = mint @ SSSError::InvalidMint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Seizer as u8], authority.key().as_ref()],
        bump = seizer_role.bump,
        constraint = seizer_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = seizer_role.assignee == authority.key() @ SSSError::Unauthorized,
    )]
    pub seizer_role: Account<'info, RoleAssignment>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The blacklisted user's token account to seize from
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// The treasury/destination token account
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
    require_role_active(&ctx.accounts.seizer_role, RoleType::Seizer)?;
    require_permanent_delegate_enabled(&ctx.accounts.config)?;

    let amount = ctx.accounts.from.amount;
    require!(amount > 0, SSSError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    // Use spl_token_2022::onchain::invoke_transfer_checked which automatically
    // handles transfer hook resolution from the mint's extension data.
    // For SSS-2 tokens, the client must pass remaining accounts:
    // [hook_program, extra_account_metas, sender_blacklist, receiver_blacklist, config]
    spl_token_2022::onchain::invoke_transfer_checked(
        &ctx.accounts.token_program.key(),
        ctx.accounts.from.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.to.to_account_info(),
        ctx.accounts.config.to_account_info(),
        ctx.remaining_accounts,
        amount,
        ctx.accounts.config.decimals,
        signer_seeds,
    )
    .map_err(|e| {
        msg!("invoke_transfer_checked error: {:?}", e);
        Into::<anchor_lang::prelude::ProgramError>::into(e)
    })?;

    emit!(TokensSeized {
        mint: mint_key,
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        seizer: ctx.accounts.authority.key(),
    });

    Ok(())
}
