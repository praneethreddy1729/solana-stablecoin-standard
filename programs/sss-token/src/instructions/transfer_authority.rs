use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::AuthorityTransferInitiated;
use crate::state::StablecoinConfig;
use crate::utils::require_authority;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    require_authority(&ctx.accounts.config, &ctx.accounts.authority.key())?;
    require!(
        ctx.accounts.config.pending_authority == Pubkey::default(),
        SSSError::AuthorityTransferAlreadyPending
    );

    let clock = Clock::get()?;
    ctx.accounts.config.pending_authority = new_authority;
    ctx.accounts.config.transfer_initiated_at = clock.unix_timestamp;

    emit!(AuthorityTransferInitiated {
        config: ctx.accounts.config.key(),
        current_authority: ctx.accounts.authority.key(),
        pending_authority: new_authority,
    });

    Ok(())
}
