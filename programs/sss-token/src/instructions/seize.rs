use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::TokensSeized;
use crate::state::{RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::{
    require_permanent_delegate_enabled, require_role_active, thaw_token_account,
};

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

    // ---------------------------------------------------------------
    // SECURITY: Seize is an enforcement action and intentionally works
    // even when the token is paused. A paused token should not prevent
    // the issuer from seizing assets from sanctioned/blacklisted users.
    // freeze_account and thaw_account also operate while paused for the
    // same reason — enforcement actions must not be blockable.
    // ---------------------------------------------------------------

    // --- Validate from_owner matches the actual owner of the `from` token account ---
    require!(
        ctx.accounts.from.owner == ctx.accounts.from_owner.key(),
        SSSError::InvalidFromOwner
    );

    // --- Verify the target account owner is blacklisted ---
    // The BlacklistEntry PDA is owned by the hook program with seeds:
    //   [b"blacklist", mint.key(), from_owner.key()]
    // We derive the expected PDA and compare against the provided account.
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

    // The PDA must actually exist (have data) and be owned by the hook program.
    // If the account doesn't exist or is owned by system program, the user is NOT blacklisted.
    require!(
        ctx.accounts.blacklist_entry.owner == &hook_program_id,
        SSSError::TargetNotBlacklisted
    );

    let amount = ctx.accounts.from.amount;
    require!(amount > 0, SSSError::ZeroAmount);

    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, mint_key.as_ref(), &[bump]]];

    // If the account is frozen (common for blacklisted accounts), thaw it first.
    // Token-2022 rejects transfer_checked on frozen accounts even when using
    // permanent delegate. Config PDA is the freeze authority so we can thaw.
    if ctx.accounts.from.is_frozen() {
        thaw_token_account(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.from.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.config.to_account_info(),
            signer_seeds,
        )?;
    }

    // Use spl_token_2022::onchain::invoke_transfer_checked which automatically
    // handles transfer hook resolution from the mint's extension data.
    // For SSS-2 tokens, the client must pass remaining accounts:
    // [hook_program, extra_account_metas, sender_blacklist, receiver_blacklist, config]
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
