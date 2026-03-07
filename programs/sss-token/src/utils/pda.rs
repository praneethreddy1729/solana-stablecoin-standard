use crate::constants::*;
use anchor_lang::prelude::*;

pub fn find_config_pda(mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED, mint.as_ref()], program_id)
}

pub fn find_role_pda(
    config: &Pubkey,
    role_type: u8,
    assignee: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[ROLE_SEED, config.as_ref(), &[role_type], assignee.as_ref()],
        program_id,
    )
}
