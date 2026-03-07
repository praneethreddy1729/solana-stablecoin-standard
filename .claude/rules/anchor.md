---
path: programs/**/*.rs
---

# Anchor Rules for SSS Programs

## PDA Management
- ALWAYS store bumps in account state structs
- NEVER recalculate bumps with `find_program_address` in instruction handlers
- Use `ctx.bumps.account_name` only during `init` to set the stored bump

## Arithmetic Safety
- ALWAYS use `checked_add`, `checked_sub`, `checked_mul`, `checked_div`
- NEVER use unchecked `+`, `-`, `*`, `/` on u64/u128
- Return `SSSError::MathOverflow` on checked arithmetic failures

## Account Validation
- ALWAYS validate `config.mint == mint.key()` in every instruction
- ALWAYS validate `role.config == config.key()` in role-gated instructions
- ALWAYS validate `role.assignee == signer.key()` in role-gated instructions
- NEVER leave `UncheckedAccount` unvalidated — add manual checks in handler

## Error Handling
- Use `SSSError` variants with `#[msg("...")]` annotations
- NEVER use `unwrap()` — use `ok_or(SSSError::...)` or `?`
- NEVER use `panic!` or `unreachable!`

## Events
- Emit events at the END of every state-changing handler
- Include all relevant pubkeys and amounts in events

## Token-2022
- Use `token_2022::spl_token_2022` for CPI, not legacy `spl_token`
- Config PDA is both mint authority and freeze authority
- Permanent delegate is the config PDA (for SSS-2 seize)
