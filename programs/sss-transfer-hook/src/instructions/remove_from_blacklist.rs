use anchor_lang::prelude::*;

use crate::errors::HookError;
use crate::state::{BlacklistEntry, BLACKLIST_SEED};

/// The sss-token program ID — used to verify config PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        close = payer,
        seeds = [BLACKLIST_SEED, mint.key().as_ref(), user.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.user == user @ HookError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The stablecoin mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Config PDA from the main program — validated in handler
    pub config: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RemoveFromBlacklist>, user: Pubkey) -> Result<()> {
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

    msg!("Unblacklisted address: {}", user);
    Ok(())
}
