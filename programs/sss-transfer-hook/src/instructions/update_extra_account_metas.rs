use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::errors::HookError;
use crate::state::BLACKLIST_SEED;

/// The sss-token program ID — used to verify config PDA derivation
const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

#[derive(Accounts)]
pub struct UpdateExtraAccountMetas<'info> {
    pub authority: Signer<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Config PDA from the main sss-token program — validated in handler
    pub config: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<UpdateExtraAccountMetas>) -> Result<()> {
    // Validate the config PDA is derived from the correct program and mint
    let (expected_config, _) = Pubkey::find_program_address(
        &[b"config", ctx.accounts.mint.key().as_ref()],
        &SSS_TOKEN_PROGRAM_ID,
    );
    require!(
        ctx.accounts.config.key() == expected_config,
        HookError::Unauthorized
    );

    // Verify config is owned by the sss-token program (defense in depth)
    require!(
        ctx.accounts.config.owner == &SSS_TOKEN_PROGRAM_ID,
        HookError::Unauthorized
    );

    // Validate the signer is the config's authority (bytes 8..40 after discriminator)
    let config_data = ctx.accounts.config.try_borrow_data()?;
    require!(config_data.len() >= 40, HookError::Unauthorized);
    let config_authority =
        Pubkey::try_from(&config_data[8..40]).map_err(|_| error!(HookError::Unauthorized))?;
    require!(
        config_authority == ctx.accounts.authority.key(),
        HookError::Unauthorized
    );
    drop(config_data);

    let extra_account_metas = vec![
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
        ExtraAccountMeta::new_with_pubkey(&ctx.accounts.config.key(), false, false)?,
    ];

    let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
    ExtraAccountMetaList::update::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    Ok(())
}
