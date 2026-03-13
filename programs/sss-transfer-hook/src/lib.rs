use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

/// The sss-token program ID — used by all instructions to verify config PDA derivation
pub const SSS_TOKEN_PROGRAM_ID: Pubkey = pubkey!("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");

declare_id!("A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB");

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "SSS Transfer Hook Program",
    project_url: "https://github.com/solanabr/solana-stablecoin-standard",
    contacts: "link:https://github.com/solanabr/solana-stablecoin-standard/issues",
    policy: "https://github.com/solanabr/solana-stablecoin-standard/blob/main/docs/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    auditors: "N/A"
}

#[program]
pub mod sss_transfer_hook {
    use super::*;

    pub fn initialize_extra_account_metas(ctx: Context<InitializeExtraAccountMetas>) -> Result<()> {
        instructions::initialize_extra_account_metas::handler(ctx)
    }

    pub fn update_extra_account_metas(ctx: Context<UpdateExtraAccountMetas>) -> Result<()> {
        instructions::update_extra_account_metas::handler(ctx)
    }

    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::handler(ctx, amount)
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

    /// Fallback handler to route Transfer Hook Execute interface calls.
    /// Token-2022 calls the hook program with the SPL Transfer Hook Execute
    /// discriminator (not the Anchor discriminator), so we need this fallback.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        use spl_discriminator::SplDiscriminate;
        use spl_transfer_hook_interface::instruction::ExecuteInstruction;

        let execute_disc = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE;
        if data.len() >= 8 && data[..8] == execute_disc[..8] {
            // Parse amount from instruction data (u64 at bytes 8..16)
            let amount = if data.len() >= 16 {
                u64::from_le_bytes(
                    data[8..16]
                        .try_into()
                        .map_err(|_| ProgramError::InvalidInstructionData)?,
                )
            } else {
                0
            };

            return instructions::execute::fallback_execute(program_id, accounts, amount);
        }

        Err(ProgramError::InvalidInstructionData.into())
    }
}
