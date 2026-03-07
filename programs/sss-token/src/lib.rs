use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("8PRbAdtmGWZRjQJpsybTgojq5UkYsCSujTERY3QhC9LW");

#[program]
pub mod sss_token {
    use super::*;

    /// Initialize a new stablecoin with Token-2022 extensions
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    /// Mint tokens (requires Minter role, checks pause + quota)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Burn tokens (requires Burner role, checks pause)
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    /// Freeze a token account (requires Freezer role)
    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    /// Thaw a frozen token account (requires Freezer role)
    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    /// Pause the token (requires Pauser role)
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    /// Unpause the token (requires Pauser role)
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    /// Create or update a role assignment (authority only)
    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        role_type: u8,
        assignee: Pubkey,
        is_active: bool,
    ) -> Result<()> {
        instructions::update_roles::handler(ctx, role_type, assignee, is_active)
    }

    /// Update minter quota (authority only)
    pub fn update_minter_quota(ctx: Context<UpdateMinterQuota>, new_quota: u64) -> Result<()> {
        instructions::update_minter_quota::handler(ctx, new_quota)
    }

    /// Initiate authority transfer (current authority only)
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_authority)
    }

    /// Accept authority transfer (pending authority only)
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handler(ctx)
    }

    /// Cancel pending authority transfer (current authority only)
    pub fn cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
        instructions::cancel_authority_transfer::handler(ctx)
    }

    /// Add address to blacklist via CPI to hook program (SSS-2, requires Blacklister role)
    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        user: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, user, reason)
    }

    /// Remove address from blacklist via CPI to hook program (SSS-2, requires Blacklister role)
    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, user: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, user)
    }

    /// Seize tokens from a blacklisted account using permanent delegate (SSS-2, authority only)
    pub fn seize<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
        instructions::seize::handler(ctx)
    }
}
