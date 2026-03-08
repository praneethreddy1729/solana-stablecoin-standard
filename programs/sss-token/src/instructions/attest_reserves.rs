use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::ReservesAttested;
use crate::state::{ReserveAttestation, RoleAssignment, RoleType, StablecoinConfig};
use crate::utils::require_role_active;

#[derive(Accounts)]
pub struct AttestReserves<'info> {
    #[account(mut)]
    pub attestor: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        has_one = mint @ SSSError::InvalidMint,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[RoleType::Attestor as u8], attestor.key().as_ref()],
        bump = attestor_role.bump,
        constraint = attestor_role.config == config.key() @ SSSError::InvalidConfig,
        constraint = attestor_role.assignee == attestor.key() @ SSSError::Unauthorized,
    )]
    pub attestor_role: Account<'info, RoleAssignment>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = attestor,
        space = RESERVE_ATTESTATION_SIZE,
        seeds = [ATTESTATION_SEED, config.key().as_ref()],
        bump,
    )]
    pub attestation: Account<'info, ReserveAttestation>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AttestReserves>,
    reserve_amount: u64,
    expires_in_seconds: i64,
    attestation_uri: String,
) -> Result<()> {
    // Validate inputs
    require!(expires_in_seconds > 0, SSSError::InvalidExpiration);
    require!(
        attestation_uri.len() <= MAX_ATTESTATION_URI_LEN,
        SSSError::AttestationUriTooLong
    );

    // Verify attestor role is active
    require_role_active(&ctx.accounts.attestor_role, RoleType::Attestor)?;

    // Read current token supply from mint
    let token_supply = ctx.accounts.mint.supply;

    // Get current timestamp
    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;
    let expires_at = timestamp
        .checked_add(expires_in_seconds)
        .ok_or(SSSError::ArithmeticOverflow)?;

    // Calculate collateralization ratio in basis points (10000 = 100%)
    let collateralization_ratio_bps = if token_supply == 0 {
        10_000u64 // 100% if no tokens minted
    } else {
        reserve_amount
            .checked_mul(10_000)
            .ok_or(SSSError::ArithmeticOverflow)?
            .checked_div(token_supply)
            .ok_or(SSSError::ArithmeticOverflow)?
    };

    // Auto-pause if undercollateralized (reserves < supply)
    let auto_paused = reserve_amount < token_supply;
    if auto_paused && !ctx.accounts.config.paused {
        ctx.accounts.config.paused = true;
    }

    // Write attestation
    let attestation = &mut ctx.accounts.attestation;
    attestation.config = ctx.accounts.config.key();
    attestation.attestor = ctx.accounts.attestor.key();
    attestation.reserve_amount = reserve_amount;
    attestation.token_supply = token_supply;
    attestation.timestamp = timestamp;
    attestation.expires_at = expires_at;
    attestation.attestation_uri = attestation_uri;
    attestation.is_valid = true;
    attestation.bump = ctx.bumps.attestation;

    emit!(ReservesAttested {
        config: ctx.accounts.config.key(),
        attestor: ctx.accounts.attestor.key(),
        reserve_amount,
        token_supply,
        collateralization_ratio_bps,
        auto_paused,
        timestamp,
    });

    Ok(())
}
