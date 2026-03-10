# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-06

### Added

#### On-Chain Programs

- **sss-token program** with 17 instructions:
  - `initialize` -- Create a Token-2022 mint with configurable extensions (MetadataPointer, TransferHook, PermanentDelegate, DefaultAccountState)
  - `mint` -- Mint tokens with Minter role check, pause guard, and cumulative quota enforcement via `checked_add`
  - `burn` -- Burn tokens with Burner role check, pause guard, and owner co-sign requirement
  - `freeze_account` / `thaw_account` -- Freeze and thaw individual token accounts (Freezer role)
  - `pause` / `unpause` -- Global pause toggle (Pauser role)
  - `update_roles` -- Create or update role assignments (authority only)
  - `update_minter` -- Set minter cumulative mint cap (authority only)
  - `transfer_authority` / `accept_authority` / `cancel_authority_transfer` -- Two-step authority transfer
  - `add_to_blacklist` / `remove_from_blacklist` -- Manage blacklist via CPI to hook program (Blacklister role, SSS-2)
  - `seize` -- Transfer tokens from blacklisted account using permanent delegate (Seizer role, SSS-2)
  - `update_treasury` -- Set treasury Pubkey for seized token destination (authority only)
  - `attest_reserves` -- Submit reserve proof, auto-pauses if undercollateralized (Attestor role)
- **sss-transfer-hook program** with 5 instructions + fallback:
  - `initialize_extra_account_metas` / `update_extra_account_metas` -- Configure transfer hook account resolution
  - `execute` -- Enforce blacklist and pause checks on every Token-2022 transfer
  - `add_to_blacklist` / `remove_from_blacklist` -- BlacklistEntry PDA creation and closure
  - `fallback` -- Route SPL Transfer Hook Execute discriminator to `execute`
- Two specification presets: **SSS-1** (basic) and **SSS-2** (compliance)
- 7 role types: Minter, Burner, Pauser, Freezer, Blacklister, Seizer, Attestor
- 34 custom error codes for sss-token (6000-6033)
- 7 custom error codes for sss-transfer-hook (6000-6006)
- 17 Anchor events for off-chain indexing
- 64-byte reserved fields on StablecoinConfig and RoleAssignment for future upgrades
- `overflow-checks = true` in release profile

#### TypeScript SDK (`sdk/core`)

- `SolanaStablecoin` class with factory methods (`create`, `load`)
- Full instruction coverage: mint, burn, freeze, thaw, pause, unpause, updateRoles, updateMinterQuota, transferAuthority, acceptAuthority, cancelAuthorityTransfer
- Compliance namespace: `compliance.blacklistAdd`, `compliance.blacklistRemove`, `compliance.seize`, `compliance.isBlacklisted`
- PDA derivation helpers: `findConfigPda`, `findRolePda`, `findBlacklistPda`, `findExtraAccountMetasPda`
- Error parsing utilities with `parseSSSError`
- TypeScript type definitions mirroring all on-chain accounts

#### CLI (`sdk/cli`)

- 13 commands: init, mint, burn, freeze, thaw, pause, unpause, blacklist, seize, status, supply, minters, holders, audit-log
- Configurable RPC URL and keypair path

#### Backend

- Fastify REST API service (port 3001)

#### Frontend

- Next.js dashboard for stablecoin management

#### Testing

- 347+ tests across 15 test files
- 34 sss-token tests covering all instructions and error paths
- 5 transfer-hook tests covering blacklist enforcement
- 15 admin-extended tests for role management edge cases
- 30 authority-pause-extended tests
- 35 compliance-extended tests
- 17 edge-case tests (zero amounts, boundary values, reason validation)
- 15 multi-user tests (concurrent role holders, independent quotas)
- 11 invariant tests (PDA derivation, config immutability)
- 8 full-lifecycle tests (SSS-1 and SSS-2 feature combinations)
- 47 role-matrix tests (comprehensive role permission coverage)
- 40 token-ops-extended tests
- 26 SDK integration tests
- 2 end-to-end lifecycle tests (SSS-1 and SSS-2)

#### Documentation

- 11 documentation files covering architecture, specifications, SDK, compliance, operations, API, security, testing, and privacy analysis
- Comprehensive README with architecture diagrams, API tables, and usage examples

[0.1.0]: https://github.com/praneethg/solana-stablecoin-standard/releases/tag/v0.1.0
