use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, HOOK_ADD_BLACKLIST_DISC, ROLE_SEED};
use crate::errors::SSSError;
use crate::events::AddressBlacklisted;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::require_role_active;

#[derive(Accounts)]
#[instruction(user: Pubkey, reason: String)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Blacklister as u8], blacklister.key().as_ref()],
        bump = blacklister_role.bump,
        constraint = blacklister_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = blacklister_role.assignee == blacklister.key() @ SSSError::Unauthorized,
    )]
    pub blacklister_role: Account<'info, RoleAssignment>,

    /// CHECK: The hook program that owns blacklist PDAs
    #[account(
        constraint = config.enable_transfer_hook @ SSSError::ComplianceNotEnabled,
        constraint = hook_program.key() == config.hook_program_id @ SSSError::InvalidHookProgram,
    )]
    pub hook_program: UncheckedAccount<'info>,

    /// CHECK: BlacklistEntry PDA in the hook program — created via CPI
    #[account(mut)]
    pub blacklist_entry: UncheckedAccount<'info>,

    /// CHECK: The mint account
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToBlacklist>, user: Pubkey, reason: String) -> Result<()> {
    // compliance_enabled already checked at the account constraint level
    require_role_active(&ctx.accounts.blacklister_role, RoleType::Blacklister)?;

    // Reason must be at most 64 bytes
    require!(reason.len() <= 64, SSSError::ReasonTooLong);

    let mint_key = ctx.accounts.config.mint;
    let bump = ctx.accounts.config.bump;

    // CPI into hook program to create BlacklistEntry PDA
    // We use invoke_signed with the config PDA as a signer to prove this CPI
    // originates from the sss-token program. The hook verifies config.is_signer
    // instead of checking payer == authority, so any authorized Blacklister can call this.
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.hook_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.blacklister.key(),
                true,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.blacklist_entry.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.mint.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.config.key(),
                true, // config as signer — proves CPI from sss-token
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.system_program.key(),
                false,
            ),
        ],
        data: {
            let reason_bytes = reason.as_bytes();
            let mut data = Vec::with_capacity(8 + 32 + 4 + reason_bytes.len());
            data.extend_from_slice(&HOOK_ADD_BLACKLIST_DISC);
            data.extend_from_slice(&user.to_bytes());
            data.extend_from_slice(&(reason_bytes.len() as u32).to_le_bytes());
            data.extend_from_slice(reason_bytes);
            data
        },
    };

    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.blacklister.to_account_info(),
            ctx.accounts.blacklist_entry.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(AddressBlacklisted {
        mint: mint_key,
        address: user,
        blacklister: ctx.accounts.blacklister.key(),
        reason,
    });

    Ok(())
}
