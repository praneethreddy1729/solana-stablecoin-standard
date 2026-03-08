use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
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
    let config = &mut ctx.accounts.config;
    config.treasury = new_treasury;

    msg!(
        "Treasury updated to {} for mint {}",
        new_treasury,
        config.mint
    );

    Ok(())
}
