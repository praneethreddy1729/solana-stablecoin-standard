use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TreasuryUpdated;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.authority == authority.key() @ SSSError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

/// Update the treasury token account where seized tokens are sent.
/// Authority-only operation.
pub fn handler(ctx: Context<UpdateTreasury>, new_treasury: Pubkey) -> Result<()> {
    // Treasury must not be zero address — seize would fail
    require!(
        new_treasury != Pubkey::default(),
        SSSError::InvalidTreasury
    );

    let config = &mut ctx.accounts.config;
    let old_treasury = config.treasury;
    config.treasury = new_treasury;

    emit!(TreasuryUpdated {
        config: config.key(),
        old_treasury,
        new_treasury,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}
