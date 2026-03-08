use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::TokenInterface;
use spl_token_2022::{
    extension::{
        default_account_state::instruction::initialize_default_account_state,
        metadata_pointer::instruction::initialize as initialize_metadata_pointer,
        transfer_hook::instruction::initialize as initialize_transfer_hook, ExtensionType,
    },
    instruction::{initialize_mint2, initialize_permanent_delegate},
    state::AccountState,
};
use spl_token_metadata_interface::instruction::initialize as initialize_token_metadata;

use crate::constants::*;
use crate::errors::SSSError;
use crate::events::StablecoinInitialized;
use crate::state::StablecoinConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_transfer_hook: bool,
    pub enable_permanent_delegate: bool,
    pub default_account_frozen: bool,
    /// Treasury token account where seized tokens are sent.
    /// Use Pubkey::default() if permanent delegate / seize is not enabled.
    pub treasury: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = STABLECOIN_CONFIG_SIZE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Initialized via raw CPI to Token-2022
    #[account(mut)]
    pub mint: Signer<'info>,

    /// CHECK: Transfer hook program, validated if transfer hook is enabled
    pub hook_program: Option<UncheckedAccount<'info>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(args.decimals <= 18, SSSError::InvalidDecimals);
    require!(args.name.len() <= MAX_NAME_LEN, SSSError::NameTooLong);
    require!(args.symbol.len() <= MAX_SYMBOL_LEN, SSSError::SymbolTooLong);
    require!(args.uri.len() <= MAX_URI_LEN, SSSError::UriTooLong);

    let config_key = ctx.accounts.config.key();
    let mint_key = ctx.accounts.mint.key();
    let token_program_id = ctx.accounts.token_program.key();

    // Determine which extensions to enable
    let mut extensions: Vec<ExtensionType> = vec![ExtensionType::MetadataPointer];

    if args.enable_permanent_delegate {
        extensions.push(ExtensionType::PermanentDelegate);
    }
    if args.enable_transfer_hook {
        extensions.push(ExtensionType::TransferHook);
    }
    if args.default_account_frozen {
        extensions.push(ExtensionType::DefaultAccountState);
    }

    // Calculate space for the mint account (extensions only).
    let extension_space =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&extensions)
            .map_err(|_| SSSError::ArithmeticOverflow)?;

    // Token-2022 metadata TLV: TYPE_SIZE(2) + LENGTH_SIZE(2) + packed data
    // Packed: 32 update_authority + 32 mint + 4+name + 4+symbol + 4+uri + 4 (additional_metadata vec)
    let metadata_inner =
        32 + 32 + (4 + args.name.len()) + (4 + args.symbol.len()) + (4 + args.uri.len()) + 4;
    let metadata_space = 2 + 2 + metadata_inner;
    let full_space = extension_space + metadata_space;

    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(full_space);

    // Create with extension-only space but lamports for full size.
    // Token-2022 will auto-realloc when initialize_token_metadata is called.
    system_program::create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
        extension_space as u64,
        &token_program_id,
    )?;

    // Step 2: Initialize PermanentDelegate (if enabled)
    if args.enable_permanent_delegate {
        let ix = initialize_permanent_delegate(&token_program_id, &mint_key, &config_key)
            .map_err(|_| SSSError::ArithmeticOverflow)?;

        anchor_lang::solana_program::program::invoke(&ix, &[ctx.accounts.mint.to_account_info()])?;
    }

    // Step 3: Initialize TransferHook (if enabled)
    if args.enable_transfer_hook {
        let hook_program = ctx
            .accounts
            .hook_program
            .as_ref()
            .ok_or(SSSError::InvalidHookProgram)?;

        let ix = initialize_transfer_hook(
            &token_program_id,
            &mint_key,
            Some(config_key),
            Some(hook_program.key()),
        )
        .map_err(|_| SSSError::ArithmeticOverflow)?;

        anchor_lang::solana_program::program::invoke(&ix, &[ctx.accounts.mint.to_account_info()])?;
    }

    // Step 4: Initialize DefaultAccountState (if enabled)
    if args.default_account_frozen {
        let ix =
            initialize_default_account_state(&token_program_id, &mint_key, &AccountState::Frozen)
                .map_err(|_| SSSError::ArithmeticOverflow)?;

        anchor_lang::solana_program::program::invoke(&ix, &[ctx.accounts.mint.to_account_info()])?;
    }

    // Step 5: Initialize MetadataPointer (point to self)
    let ix = initialize_metadata_pointer(
        &token_program_id,
        &mint_key,
        Some(config_key),
        Some(mint_key),
    )
    .map_err(|_| SSSError::ArithmeticOverflow)?;

    anchor_lang::solana_program::program::invoke(&ix, &[ctx.accounts.mint.to_account_info()])?;

    // Step 6: Initialize Mint (config PDA as both mint authority and freeze authority)
    let ix = initialize_mint2(
        &token_program_id,
        &mint_key,
        &config_key,
        Some(&config_key),
        args.decimals,
    )
    .map_err(|_| SSSError::ArithmeticOverflow)?;

    anchor_lang::solana_program::program::invoke(&ix, &[ctx.accounts.mint.to_account_info()])?;

    // Step 7: Initialize Token Metadata (AFTER mint init — uses config PDA as update authority)
    let bump = ctx.bumps.config;
    let signer_seeds: &[&[u8]] = &[CONFIG_SEED, mint_key.as_ref(), &[bump]];

    let ix = initialize_token_metadata(
        &token_program_id,
        &mint_key,
        &config_key,
        &mint_key,
        &config_key,
        args.name.clone(),
        args.symbol.clone(),
        args.uri.clone(),
    );

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.config.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Set config state
    let hook_program_id = if args.enable_transfer_hook {
        ctx.accounts
            .hook_program
            .as_ref()
            .map(|h| h.key())
            .unwrap_or_default()
    } else {
        Pubkey::default()
    };

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = Pubkey::default();
    config.transfer_initiated_at = 0;
    config.mint = mint_key;
    config.hook_program_id = hook_program_id;
    config.decimals = args.decimals;
    config.paused = false;
    config.enable_transfer_hook = args.enable_transfer_hook;
    config.enable_permanent_delegate = args.enable_permanent_delegate;
    config.default_account_frozen = args.default_account_frozen;
    config.bump = bump;
    config.treasury = args.treasury;
    config._reserved = [0u8; 32];

    emit!(StablecoinInitialized {
        mint: mint_key,
        authority: ctx.accounts.authority.key(),
        decimals: args.decimals,
        name: args.name,
        symbol: args.symbol,
        enable_transfer_hook: args.enable_transfer_hook,
        enable_permanent_delegate: args.enable_permanent_delegate,
        default_account_frozen: args.default_account_frozen,
    });

    Ok(())
}
