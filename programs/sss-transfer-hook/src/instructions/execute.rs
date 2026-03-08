use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::errors::HookError;

/// The sss-token program ID — used to verify config PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

/// Transfer hook execute — called automatically by Token-2022 on every transfer.
/// Checks if sender or receiver is blacklisted.
/// Bypasses blacklist check if the transfer is initiated by the permanent delegate (seize).
#[derive(Accounts)]
pub struct Execute<'info> {
    /// Source token account
    /// CHECK: Validated by Token-2022
    pub source: UncheckedAccount<'info>,

    /// The mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Destination token account
    /// CHECK: Validated by Token-2022
    pub destination: UncheckedAccount<'info>,

    /// Owner or delegate of source
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
    require!(
        config.key() == expected_config,
        HookError::Unauthorized
    );

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

    // Validate config account: owner + PDA derivation
    validate_config(
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.mint.key(),
    )?;

    // Check pause state from config
    // Layout: 8 discriminator + 32 authority + 32 pending + 8 transfer_initiated_at + 32 mint + 32 hook_program_id + 1 decimals = byte 145 is paused
    let config_data = ctx.accounts.config.try_borrow_data()?;
    if config_data.len() > 145 && config_data[145] == 1 {
        return Err(HookError::TokenPaused.into());
    }
    drop(config_data);

    // Validate and check sender blacklist
    validate_blacklist_account(&ctx.accounts.sender_blacklist.to_account_info())?;
    if !ctx.accounts.sender_blacklist.data_is_empty() {
        let data = ctx.accounts.sender_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::SenderBlacklisted.into());
        }
    }

    // Validate and check receiver blacklist
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

    // Validate config account: owner + PDA derivation
    validate_config(config, &mint_info.key())?;

    // Check pause state from config
    let config_data = config.try_borrow_data()?;
    if config_data.len() > 145 && config_data[145] == 1 {
        return Err(HookError::TokenPaused.into());
    }
    drop(config_data);

    // Validate and check sender blacklist
    validate_blacklist_account(sender_blacklist)?;
    if !sender_blacklist.data_is_empty() {
        let data = sender_blacklist.try_borrow_data()?;
        if data.len() >= 8 {
            return Err(HookError::SenderBlacklisted.into());
        }
    }

    // Validate and check receiver blacklist
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
pub fn check_permanent_delegate(mint_data: &[u8], owner_delegate: &Pubkey) -> bool {
    // Token-2022 mint: 82 bytes base + padding to 165 + 1 account type byte = 166
    // Extensions follow at offset 166
    // Each extension: 2 bytes type + 2 bytes length + data
    // PermanentDelegate extension type = 12, data = 32 bytes (delegate pubkey)
    if mint_data.len() < 166 {
        return false;
    }

    let mut offset = 166;
    while offset + 4 <= mint_data.len() {
        let ext_type = u16::from_le_bytes([mint_data[offset], mint_data[offset + 1]]);
        let ext_len = u16::from_le_bytes([mint_data[offset + 2], mint_data[offset + 3]]) as usize;

        if ext_type == 12 && ext_len >= 32 && offset + 4 + 32 <= mint_data.len() {
            let delegate_bytes = &mint_data[offset + 4..offset + 4 + 32];
            return delegate_bytes == owner_delegate.as_ref();
        }

        offset += 4 + ext_len;
        offset = (offset + 3) & !3; // align to 4 bytes
    }

    false
}
