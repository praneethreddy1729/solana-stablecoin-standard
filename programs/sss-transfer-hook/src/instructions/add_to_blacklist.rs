use anchor_lang::prelude::*;

use crate::errors::HookError;
use crate::state::{BlacklistEntry, BLACKLIST_SEED};

/// The sss-token program ID — used to verify config PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

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
    // Validate the config PDA is derived from the correct program and mint
    let (expected_config, _) = Pubkey::find_program_address(
        &[b"config", ctx.accounts.mint.key().as_ref()],
        &SSS_TOKEN_PROGRAM_ID,
    );
    require!(
        ctx.accounts.config.key() == expected_config,
        HookError::Unauthorized
    );

    // Verify config is owned by the sss-token program (defense in depth)
    require!(
        ctx.accounts.config.owner == &SSS_TOKEN_PROGRAM_ID,
        HookError::Unauthorized
    );

    // Verify payer is the config authority (bytes 8..40 after Anchor discriminator)
    let config_data = ctx.accounts.config.try_borrow_data()?;
    require!(config_data.len() >= 40, HookError::Unauthorized);
    let config_authority =
        Pubkey::try_from(&config_data[8..40]).map_err(|_| error!(HookError::Unauthorized))?;
    require!(
        ctx.accounts.payer.key() == config_authority,
        HookError::Unauthorized
    );
    drop(config_data);

    let entry = &mut ctx.accounts.blacklist_entry;
    entry.mint = ctx.accounts.mint.key();
    entry.user = user;
    entry.bump = ctx.bumps.blacklist_entry;
    entry.reason = reason;

    msg!("Blacklisted address: {}", user);
    Ok(())
}
