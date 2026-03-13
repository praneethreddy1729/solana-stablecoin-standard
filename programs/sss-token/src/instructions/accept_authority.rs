use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::AuthorityTransferAccepted;
use crate::state::StablecoinConfig;

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,
}

pub fn handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        config.pending_authority != Pubkey::default(),
        SSSError::AuthorityTransferNotPending
    );
    require!(
        config.pending_authority == ctx.accounts.new_authority.key(),
        SSSError::InvalidPendingAuthority
    );

    let old_authority = config.authority;
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.new_authority.key();
    config.pending_authority = Pubkey::default();
    config.transfer_initiated_at = 0;

    emit!(AuthorityTransferAccepted {
        config: ctx.accounts.config.key(),
        old_authority,
        new_authority: ctx.accounts.new_authority.key(),
    });

    Ok(())
}
