# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-11

### Added

#### Security Hardening
- Three full audit passes completed; all CRITICAL, HIGH, MEDIUM, and LOW findings resolved
- `CannotFreezeTreasury` guard (`freeze_account` rejects treasury token account as target)
- `InvalidTokenProgram` error for instructions receiving legacy Token program instead of Token-2022
- Separation of manual pause (`paused`) and attestation-triggered pause (`paused_by_attestation`); `unpause` clears both
- `overflow-checks = true` already active; added `lto = "fat"` and `codegen-units = 1` for release hardening

#### CI/CD and Docker
- GitHub Actions workflows for build, test, and lint
- Dockerfile and docker-compose for local development environment
- Automated test runner with localnet feature deactivation (`CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM`)

#### Documentation
- `docs/CLI.md` — full CLI command reference (18 commands with options and examples)
- `docs/ERRORS.md` — all error codes from both programs with category descriptions

---

## [0.3.0] - 2026-03-09

### Added

#### Reserve Attestation (sss-token)
- `attest_reserves` instruction: Attestor submits reserve amount + URI + expiration
- `ReserveAttestation` PDA (`["attestation", config]`) storing last attestation data
- Auto-pause on undercollateralization: if `reserve_amount < token_supply`, sets `paused_by_attestation = true`
- `collateralization_ratio_bps` field (10000 = 100%) emitted in `ReservesAttested` event
- `Undercollateralized` (6032), `AttestationUriTooLong` (6030), `InvalidExpiration` (6031) errors

#### Stablecoin Registry
- Registry PDA (`["registry", mint]`) for on-chain auto-discovery via `getProgramAccounts`
- `StablecoinRegistered` event emitted during `initialize`
- `findRegistryEntryPda` helper in SDK and `REGISTRY_SEED` constant
- `RegistryEntry` type exported from SDK

#### Frontend Dashboard
- Next.js frontend dashboard for stablecoin management
- Reserve attestation UI panel
- Registry browser showing all deployed stablecoins

#### Devnet Deployment
- Both programs deployed to Solana devnet
- SSS Token: `tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz`
- Transfer Hook: `A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB`

---

## [0.2.0] - 2026-03-07

### Added

#### SSS-2 Compliance (sss-transfer-hook + sss-token integration)
- `sss-transfer-hook` program with 5 instructions + fallback handler
  - `initialize_extra_account_metas` / `update_extra_account_metas`
  - `execute` — blacklist and pause enforcement on every Token-2022 transfer
  - `add_to_blacklist` / `remove_from_blacklist` — `BlacklistEntry` PDA management
  - `fallback` — routes SPL Transfer Hook Execute discriminator to `execute`
- `BlacklistEntry` PDA (`["blacklist", mint, user]`) with reason string (max 64 bytes)
- Seize bypass in `execute`: permanent delegate transfers allowed even from blacklisted accounts
- CPI from sss-token to hook program for blacklist management using `invoke_signed` with config PDA signer seeds
- `Preset.SSS_2` enabling TransferHook + PermanentDelegate extensions on initialize
- `add_to_blacklist`, `remove_from_blacklist`, `seize`, `update_treasury` instructions in sss-token
- `ComplianceNotEnabled` (6022), `PermanentDelegateNotEnabled` (6023), `ReasonTooLong` (6024), `InvalidTreasury` (6025), `TargetNotBlacklisted` (6026), `AccountDeliberatelyFrozen` (6027), `InvalidBlacklistEntry` (6028), `InvalidFromOwner` (6029) errors
- `compliance.blacklistAdd`, `compliance.blacklistRemove`, `compliance.seize`, `compliance.isBlacklisted` SDK methods
- `blacklist add/remove/check`, `seize`, `update-treasury` CLI commands

---

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
- 35 custom error codes for sss-token (6000-6034)
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

- 18 commands: init, mint, burn, freeze, thaw, pause, unpause, blacklist (add/remove/check), seize, status, supply, minters, holders, audit-log, transfer-authority, accept-authority, cancel-authority-transfer, attest-reserves, update-treasury
- Configurable RPC URL and keypair path

#### Backend

- Fastify REST API service (port 3001)

#### Frontend

- Next.js dashboard for stablecoin management

#### Testing

- 395 integration and unit tests across 16 files
- 34 sss-token tests covering all instructions and error paths
- 5 transfer-hook tests covering blacklist enforcement
- 15 admin-roles tests for role management edge cases
- 30 authority-pause tests
- 35 compliance-flows tests
- 17 edge-case tests (zero amounts, boundary values, reason validation)
- 15 multi-user tests (concurrent role holders, independent quotas)
- 11 invariant tests (PDA derivation, config immutability)
- 8 full-lifecycle tests (SSS-1 and SSS-2 feature combinations)
- 47 role-matrix tests (comprehensive role permission coverage)
- 40 token-ops-edge tests
- 26 SDK integration tests
- 11 reserve-attestation tests
- 2 end-to-end lifecycle tests (SSS-1 and SSS-2)

#### Documentation

- 11 documentation files covering architecture, specifications, SDK, compliance, operations, API, security, testing, and privacy analysis
- Comprehensive README with architecture diagrams, API tables, and usage examples

[0.4.0]: https://github.com/solanabr/solana-stablecoin-standard/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/solanabr/solana-stablecoin-standard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/solanabr/solana-stablecoin-standard/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/solanabr/solana-stablecoin-standard/releases/tag/v0.1.0
