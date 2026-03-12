use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokensSeized;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{require_permanent_delegate_enabled, require_role_active, thaw_token_account};

/// Blacklist PDA seed used by the transfer hook program.
/// Must match `programs/sss-transfer-hook/src/state.rs::BLACKLIST_SEED`.
const BLACKLIST_SEED: &[u8] = b"blacklist";

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

    /// The blacklisted user's token account to seize from.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub from: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: The wallet owner of the `from` token account.
    /// Validated in handler to match `from.owner`.
    pub from_owner: UncheckedAccount<'info>,

    /// CHECK: BlacklistEntry PDA owned by the hook program.
    /// Seeds: [b"blacklist", mint, from_owner] under hook_program_id.
    /// Verified manually in handler because this PDA belongs to another program.
    pub blacklist_entry: UncheckedAccount<'info>,

    /// The treasury token account — seized tokens MUST go here.
    /// SECURITY: Constraining destination prevents a seizer from redirecting
    /// seized funds to their own account.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
        constraint = to.key() == config.treasury @ SSSError::InvalidTreasury,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    #[account(constraint = token_program.key() == anchor_spl::token_2022::ID @ SSSError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
    require_role_active(&ctx.accounts.seizer_role, RoleType::Seizer)?;
    require_permanent_delegate_enabled(&ctx.accounts.config)?;

    // SECURITY: Enforcement actions (seize, freeze, thaw) intentionally
    // work even when the token is paused — must not be blockable.
    require!(
        ctx.accounts.from.owner == ctx.accounts.from_owner.key(),
        SSSError::InvalidFromOwner
    );

    // Verify the target is blacklisted by checking the hook program's BlacklistEntry PDA
    let hook_program_id = ctx.accounts.config.hook_program_id;
    require!(
        hook_program_id != Pubkey::default(),
        SSSError::ComplianceNotEnabled
    );

    let (expected_blacklist_pda, _bump) = Pubkey::find_program_address(
        &[
            BLACKLIST_SEED,
            ctx.accounts.mint.key().as_ref(),
            ctx.accounts.from_owner.key().as_ref(),
        ],
        &hook_program_id,
    );
    require!(
        ctx.accounts.blacklist_entry.key() == expected_blacklist_pda,
        SSSError::InvalidBlacklistEntry
    );

    // Must be owned by hook program (not system program) to confirm blacklist exists
    require!(
        ctx.accounts.blacklist_entry.owner == &hook_program_id,
        SSSError::TargetNotBlacklisted
    );

    let amount = ctx.accounts.from.amount;
    require!(amount > 0, SSSError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    // Token-2022 rejects transfer_checked on frozen accounts even with permanent delegate
    if ctx.accounts.from.is_frozen() {
        thaw_token_account(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.from.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.config.to_account_info(),
            signer_seeds,
        )?;
    }

    // Config PDA is both permanent delegate and transfer authority.
    // The hook's execute handler detects the permanent delegate and bypasses
    // blacklist checks, allowing seizure from blacklisted accounts.
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
