use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::errors::HookError;

/// The sss-token program ID — used to verify config PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

/// Byte offset of `paused` field in StablecoinConfig (cross-program raw read)
/// Layout: 8 discriminator + 32 authority + 32 pending_authority + 8 transfer_initiated_at + 32 mint + 32 hook_program_id + 1 decimals = 145
const CONFIG_PAUSED_OFFSET: usize = 145;
/// Byte offset of `paused_by_attestation` field in StablecoinConfig
/// Layout: CONFIG_PAUSED_OFFSET + 1 paused + 1 enable_transfer_hook + 1 enable_permanent_delegate + 1 default_account_frozen + 1 bump + 32 treasury = 182
const CONFIG_PAUSED_BY_ATTESTATION_OFFSET: usize = 182;
/// Token-2022 PermanentDelegate extension type ID
const PERMANENT_DELEGATE_EXTENSION_TYPE: u16 = 12;
/// Offset where Token-2022 extensions begin in mint account data
const MINT_EXTENSIONS_OFFSET: usize = 166;

/// Transfer hook execute — called automatically by Token-2022 on every transfer.
/// Checks if sender or receiver is blacklisted.
/// Bypasses blacklist check if the transfer is initiated by the permanent delegate (seize).
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Validated by Token-2022
    pub source: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Validated by Token-2022
    pub destination: UncheckedAccount<'info>,

    /// CHECK: Validated by Token-2022
    pub owner_delegate: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    /// Sender blacklist PDA (may not exist = not blacklisted)
    /// CHECK: Validated in handler — owner checked when non-empty
    pub sender_blacklist: UncheckedAccount<'info>,

    /// Receiver blacklist PDA (may not exist = not blacklisted)
    /// CHECK: Validated in handler — owner checked when non-empty
    pub receiver_blacklist: UncheckedAccount<'info>,

    /// CHECK: Config PDA from main program — validated in handler (owner + PDA derivation)
    pub config: UncheckedAccount<'info>,
}

/// Validate that the config account is the correct PDA owned by the sss-token program.
fn validate_config(config: &AccountInfo, mint_key: &Pubkey) -> Result<()> {
    // Verify owner is the sss-token program
    require!(
        config.owner == &SSS_TOKEN_PROGRAM_ID,
        HookError::Unauthorized
    );

    // Verify PDA derivation
    let (expected_config, _) =
        Pubkey::find_program_address(&[b"config", mint_key.as_ref()], &SSS_TOKEN_PROGRAM_ID);
    require!(config.key() == expected_config, HookError::Unauthorized);

    Ok(())
}

/// Validate that a blacklist account (when non-empty) is owned by this program.
fn validate_blacklist_account(account: &AccountInfo) -> Result<()> {
    if !account.data_is_empty() {
        require!(
            account.owner == &crate::ID,
            HookError::InvalidBlacklistEntry
        );
    }
    Ok(())
}

pub fn handler(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    let mint_info = ctx.accounts.mint.to_account_info();
    let mint_data_ref = mint_info.try_borrow_data()?;

    let is_permanent_delegate_transfer =
        check_permanent_delegate(&mint_data_ref, &ctx.accounts.owner_delegate.key());

    if is_permanent_delegate_transfer {
        msg!("Transfer initiated by permanent delegate — bypassing blacklist check");
        return Ok(());
    }

    validate_config(
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.mint.key(),
    )?;

    let config_data = ctx.accounts.config.try_borrow_data()?;
    if config_data.len() > CONFIG_PAUSED_OFFSET && config_data[CONFIG_PAUSED_OFFSET] == 1 {
        return Err(HookError::TokenPaused.into());
    }
    // Separate error for attestation pause vs manual pause
    if config_data.len() > CONFIG_PAUSED_BY_ATTESTATION_OFFSET
        && config_data[CONFIG_PAUSED_BY_ATTESTATION_OFFSET] == 1
    {
        return Err(HookError::TokenPausedByAttestation.into());
    }
    drop(config_data);

    validate_blacklist_account(&ctx.accounts.sender_blacklist.to_account_info())?;
    if !ctx.accounts.sender_blacklist.data_is_empty() {
        let data = ctx.accounts.sender_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::SenderBlacklisted.into());
        }
    }

    validate_blacklist_account(&ctx.accounts.receiver_blacklist.to_account_info())?;
    if !ctx.accounts.receiver_blacklist.data_is_empty() {
        let data = ctx.accounts.receiver_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::ReceiverBlacklisted.into());
        }
    }

    Ok(())
}

/// Fallback entry point for the Transfer Hook Execute interface.
/// Token-2022 calls this with the SPL Transfer Hook discriminator, not Anchor's.
/// Account layout: source(0), mint(1), destination(2), owner_delegate(3),
///                 extra_account_metas(4), sender_blacklist(5), receiver_blacklist(6), config(7)
pub fn fallback_execute<'info>(
    _program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    _amount: u64,
) -> Result<()> {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys.into());
    }

    let mint_info = &accounts[1];
    let owner_delegate = &accounts[3];
    let sender_blacklist = &accounts[5];
    let receiver_blacklist = &accounts[6];
    let config = &accounts[7];

    let mint_data_ref = mint_info.try_borrow_data()?;

    let is_permanent_delegate_transfer =
        check_permanent_delegate(&mint_data_ref, &owner_delegate.key());

    if is_permanent_delegate_transfer {
        msg!("Transfer initiated by permanent delegate — bypassing blacklist check");
        return Ok(());
    }

    validate_config(config, &mint_info.key())?;

    let config_data = config.try_borrow_data()?;
    if config_data.len() > CONFIG_PAUSED_OFFSET && config_data[CONFIG_PAUSED_OFFSET] == 1 {
        return Err(HookError::TokenPaused.into());
    }
    if config_data.len() > CONFIG_PAUSED_BY_ATTESTATION_OFFSET
        && config_data[CONFIG_PAUSED_BY_ATTESTATION_OFFSET] == 1
    {
        return Err(HookError::TokenPausedByAttestation.into());
    }
    drop(config_data);

    validate_blacklist_account(sender_blacklist)?;
    if !sender_blacklist.data_is_empty() {
        let data = sender_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::SenderBlacklisted.into());
        }
    }

    validate_blacklist_account(receiver_blacklist)?;
    if !receiver_blacklist.data_is_empty() {
        let data = receiver_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::ReceiverBlacklisted.into());
        }
    }

    Ok(())
}

/// Check if the owner/delegate matches the permanent delegate stored in the mint's extension data.
///
/// Token-2022 mint account layout:
///   - 82 bytes: base Mint state (supply, decimals, authorities, etc.)
///   - 83 bytes: padding to 165 bytes
///   - 1 byte:   account type discriminator (= 2 for Mint)
///   - Extensions start at byte 166 (MINT_EXTENSIONS_OFFSET)
///
/// Each extension is a TLV (Type-Length-Value) entry:
///   - 2 bytes: extension type ID (little-endian u16)
///   - 2 bytes: data length (little-endian u16)
///   - N bytes: extension data
///   - Padding to 4-byte alignment
///
/// PermanentDelegate (type 12): 32 bytes = the delegate's pubkey.
/// If the transfer's owner_delegate matches, this is a seize via permanent delegate
/// and we bypass blacklist checks so the issuer can recover funds.
pub fn check_permanent_delegate(mint_data: &[u8], owner_delegate: &Pubkey) -> bool {
    if mint_data.len() < MINT_EXTENSIONS_OFFSET {
        return false;
    }

    let mut offset = MINT_EXTENSIONS_OFFSET;
    while offset
        .checked_add(4)
        .is_some_and(|end| end <= mint_data.len())
    {
        let ext_type = u16::from_le_bytes([mint_data[offset], mint_data[offset + 1]]);
        let ext_len = u16::from_le_bytes([mint_data[offset + 2], mint_data[offset + 3]]) as usize;

        if ext_type == PERMANENT_DELEGATE_EXTENSION_TYPE
            && ext_len >= 32
            && offset
                .checked_add(4 + 32)
                .is_some_and(|end| end <= mint_data.len())
        {
            let delegate_bytes = &mint_data[offset + 4..offset + 4 + 32];
            return delegate_bytes == owner_delegate.as_ref();
        }

        // Advance past this TLV entry, aligned to 4 bytes
        offset = match offset.checked_add(4).and_then(|v| v.checked_add(ext_len)) {
            Some(next) => (next.checked_add(3).unwrap_or(next)) & !3,
            None => break, // overflow — malformed data, stop scanning
        };
    }

    false
}
