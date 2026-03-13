use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "SSS Token Program",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/docs/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "N/A"
}

#[program]
pub mod sss_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        instructions::freeze_account::handler(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        instructions::thaw_account::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::unpause::handler(ctx)
    }

    pub fn update_roles(
        ctx: Context<UpdateRoles>,
        role_type: u8,
        assignee: Pubkey,
        is_active: bool,
    ) -> Result<()> {
        instructions::update_roles::handler(ctx, role_type, assignee, is_active)
    }

    pub fn update_minter(ctx: Context<UpdateMinterQuota>, new_quota: u64) -> Result<()> {
        instructions::update_minter_quota::handler(ctx, new_quota)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::transfer_authority::handler(ctx, new_authority)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handler(ctx)
    }

    pub fn cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
        instructions::cancel_authority_transfer::handler(ctx)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        user: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::add_to_blacklist::handler(ctx, user, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, user: Pubkey) -> Result<()> {
        instructions::remove_from_blacklist::handler(ctx, user)
    }

    pub fn seize<'info>(ctx: Context<'_, '_, 'info, 'info, Seize<'info>>) -> Result<()> {
        instructions::seize::handler(ctx)
    }

    pub fn update_treasury(ctx: Context<UpdateTreasury>, new_treasury: Pubkey) -> Result<()> {
        instructions::update_treasury::handler(ctx, new_treasury)
    }

    /// Auto-pauses minting if reserves < token supply
    pub fn attest_reserves(
        ctx: Context<AttestReserves>,
        reserve_amount: u64,
        expires_in_seconds: i64,
        attestation_uri: String,
    ) -> Result<()> {
        instructions::attest_reserves::handler(
            ctx,
            reserve_amount,
            expires_in_seconds,
            attestation_uri,
        )
    }
}
