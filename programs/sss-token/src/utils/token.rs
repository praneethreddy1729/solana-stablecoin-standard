use anchor_lang::prelude::*;
use anchor_spl::token_2022;

/// Mint tokens using config PDA as mint authority
pub fn mint_tokens<'info>(
    token_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = token_2022::MintTo {
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    token_2022::mint_to(cpi_ctx, amount)
}

/// Freeze a token account using config PDA as freeze authority
pub fn freeze_token_account<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = token_2022::FreezeAccount {
        account: account.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    token_2022::freeze_account(cpi_ctx)
}

/// Thaw a token account using config PDA as freeze authority
pub fn thaw_token_account<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = token_2022::ThawAccount {
        account: account.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    token_2022::thaw_account(cpi_ctx)
}
