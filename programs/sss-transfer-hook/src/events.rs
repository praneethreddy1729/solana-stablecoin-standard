use anchor_lang::prelude::*;

#[event]
pub struct ExtraAccountMetasInitialized {
    pub mint: Pubkey,
    pub payer: Pubkey,
}

#[event]
pub struct ExtraAccountMetasUpdated {
    pub mint: Pubkey,
    pub authority: Pubkey,
}
