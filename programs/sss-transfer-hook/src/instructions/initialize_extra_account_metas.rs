use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::errors::HookError;
use crate::events::ExtraAccountMetasInitialized;
use crate::state::BLACKLIST_SEED;
use crate::SSS_TOKEN_PROGRAM_ID;

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA - validated by seeds
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The config PDA from the main sss-token program — validated in handler
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let hook_program_id = crate::ID;

    // Validate the config PDA is derived from the correct program and mint
    let (expected_config, _) =
        Pubkey::find_program_address(&[b"config", mint_key.as_ref()], &SSS_TOKEN_PROGRAM_ID);
    require!(
        ctx.accounts.config.key() == expected_config,
        HookError::Unauthorized
    );

    require!(
        ctx.accounts.config.owner == &SSS_TOKEN_PROGRAM_ID,
        HookError::Unauthorized
    );

    // Validate the payer is the config's authority (bytes 8..40 after discriminator)
    let config_data = ctx.accounts.config.try_borrow_data()?;
    require!(config_data.len() >= 40, HookError::Unauthorized);
    let config_authority =
        Pubkey::try_from(&config_data[8..40]).map_err(|_| error!(HookError::Unauthorized))?;
    require!(
        config_authority == ctx.accounts.payer.key(),
        HookError::Unauthorized
    );
    drop(config_data);

    // Define extra accounts needed by the execute hook:
    // 1. Sender blacklist PDA: [b"blacklist", mint, source_token_account.owner]
    //    Source token account is at index 0, owner pubkey is at bytes 32..64
    // 2. Receiver blacklist PDA: [b"blacklist", mint, dest_token_account.owner]
    //    Destination token account is at index 2, owner pubkey is at bytes 32..64
    // 3. Config PDA from main program (to check pause state)

    let extra_account_metas = vec![
        // Sender blacklist PDA (not signer, not writable)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 1 },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        // Receiver blacklist PDA (not signer, not writable)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey { index: 1 },
                Seed::AccountData {
                    account_index: 2,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        // Config PDA (read-only, not signer)
        ExtraAccountMeta::new_with_pubkey(&ctx.accounts.config.key(), false, false)?,
    ];

    let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let bump = ctx.bumps.extra_account_metas;
    let signer_seeds: &[&[u8]] = &[b"extra-account-metas", mint_key.as_ref(), &[bump]];

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_metas.to_account_info(),
            },
            &[signer_seeds],
        ),
        lamports,
        account_size as u64,
        &hook_program_id,
    )?;

    let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    emit!(ExtraAccountMetasInitialized {
        mint: mint_key,
        payer: ctx.accounts.payer.key(),
    });

    Ok(())
}
