use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("J9eLtU1WpAThPvysxzLKkYhoBZaMQJPwjNStTKSokJcf");

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
