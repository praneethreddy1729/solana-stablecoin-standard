use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::AuthorityTransferCancelled;
use crate::state::StablecoinConfig;
use crate::utils::require_authority;

#[derive(Accounts)]
pub struct CancelAuthorityTransfer<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
    require_authority(&ctx.accounts.config, &ctx.accounts.authority.key())?;
    require!(
        ctx.accounts.config.pending_authority != Pubkey::default(),
        SSSError::AuthorityTransferNotPending
    );

    ctx.accounts.config.pending_authority = Pubkey::default();
    ctx.accounts.config.transfer_initiated_at = 0;

    emit!(AuthorityTransferCancelled {
        config: ctx.accounts.config.key(),
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}
