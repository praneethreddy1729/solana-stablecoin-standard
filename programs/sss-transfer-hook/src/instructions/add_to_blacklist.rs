use anchor_lang::prelude::*;

use crate::errors::HookError;
use crate::state::{BlacklistEntry, BLACKLIST_SEED};
use crate::SSS_TOKEN_PROGRAM_ID;

#[derive(Accounts)]
#[instruction(user: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = BlacklistEntry::SIZE,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), user.as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The stablecoin mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Config PDA from the main program — validated in handler
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, user: Pubkey, reason: String) -> Result<()> {
    let (expected_config, _) = Pubkey::find_program_address(
        &[b"config", ctx.accounts.mint.key().as_ref()],
        &SSS_TOKEN_PROGRAM_ID,
    );
    require!(
        ctx.accounts.config.key() == expected_config,
        HookError::Unauthorized
    );

    require!(
        ctx.accounts.config.owner == &SSS_TOKEN_PROGRAM_ID,
        HookError::Unauthorized
    );

    // Config PDA as signer proves CPI from sss-token (only it can invoke_signed)
    require!(ctx.accounts.config.is_signer, HookError::Unauthorized);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.user = user;
    entry.bump = ctx.bumps.blacklist_entry;
    entry.reason = reason;

    msg!("Blacklisted address: {}", user);
    Ok(())
}
