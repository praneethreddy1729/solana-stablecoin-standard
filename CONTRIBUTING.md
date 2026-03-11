# Contributing to the Solana Stablecoin Standard (SSS)

Thank you for your interest in contributing. This guide covers everything needed to get started, whether you're fixing a bug, adding a compliance module, or proposing a new stablecoin standard.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Implementing a New SSS Standard](#implementing-a-new-sss-standard)
- [Implementing a New Module](#implementing-a-new-module)
- [Testing Requirements](#testing-requirements)
- [Code Standards](#code-standards)
- [Security Rules](#security-rules)
- [Pull Request Process](#pull-request-process)

---

## Prerequisites

- Rust 1.84+
- Solana CLI 2.2+
- Anchor 0.32+
- Node.js 20+ (22+ recommended)
- Yarn

Verify your toolchain:

```bash
rustc --version          # >= 1.84
solana --version         # >= 2.2
anchor --version         # >= 0.32
node --version           # >= 20
yarn --version
```

---

## Getting Started

```bash
git clone https://github.com/your-org/solana-stablecoin-standard.git
cd solana-stablecoin-standard
yarn install
PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/local/bin:$PATH" CC=/usr/bin/cc anchor build
```

To run the full test suite:

```bash
pkill -f solana-test-validator; sleep 2
solana-test-validator --deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM --reset --bind-address 127.0.0.1 --bpf-program tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz target/deploy/sss_token.so --bpf-program A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB target/deploy/sss_transfer_hook.so &
sleep 5
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

> **Note**: `anchor test` can have environment issues on some setups. Use the manual validator + mocha invocation above.

> **Note**: The `--deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM` flag is required. Agave 3.0.x SIMD-0219 breaks Token-2022 metadata realloc without it.

---

## Project Structure

```
programs/
  sss-token/              # Main stablecoin program (17 instructions, SSS-1 + SSS-2)
  sss-transfer-hook/      # Transfer hook program + blacklist enforcement
sdk/
  core/                   # @stbr/sss-token — TypeScript SDK
  cli/                    # Admin CLI tool (Anchor + Commander)
frontend/                 # Next.js management dashboard
backend/                  # Fastify REST API
tests/                    # Integration tests (15 files, 395 tests)
docs/                     # Specifications and guides (11 files)
trident-tests/            # Fuzz and invariant tests
scripts/                  # Utility and deployment scripts
examples/                 # Usage examples
migrations/               # Anchor migration scripts
```

### Program Architecture

**`programs/sss-token/`** implements the SSS-1 and SSS-2 standards:

| Standard | Description |
|----------|-------------|
| SSS-1 | Regulated stablecoin with mint/burn roles, pause, freeze, blacklist |
| SSS-2 | SSS-1 + seize (permanent delegate), reserve attestation, auto-pause |

The 17 instructions span: `initialize`, `update_authority`, `assign_role`, `revoke_role`, `mint`, `burn`, `pause`, `unpause`, `freeze_account`, `thaw_account`, `seize`, `add_to_blacklist`, `remove_from_blacklist`, `update_transfer_hook`, `register_reserve_attestation`, `update_reserve_attestation`, `deregister_reserve_attestation`.

**`programs/sss-transfer-hook/`** is invoked automatically by Token-2022 on every transfer. It checks both sender and receiver against `BlacklistEntry` PDAs and blocks the transfer if either is blacklisted.

### Key PDAs

| Account | Seeds | Owner |
|---------|-------|-------|
| Config | `["config", mint]` | sss-token |
| Role | `["role", config, role_type, assignee]` | sss-token |
| ReserveAttestation | `["attestation", config]` | sss-token |
| BlacklistEntry | `["blacklist", mint, user]` | sss-transfer-hook |
| ExtraAccountMetas | `["extra-account-metas", mint]` | sss-transfer-hook |

---

## Development Workflow

### Branching

Always branch before starting work:

```bash
git checkout -b <type>/<scope>-<description>
# Examples:
# feat/sss-token-rate-limiting
# fix/hook-blacklist-ata-lookup
# docs/sss-3-draft-spec
# test/reserve-attestation-edge-cases
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`

### Build

```bash
# Build both programs
PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/local/bin:$PATH" CC=/usr/bin/cc anchor build

# Build a specific program
PATH="..." CC=/usr/bin/cc anchor build -p sss-token
PATH="..." CC=/usr/bin/cc anchor build -p sss_transfer_hook
```

### Format and Lint

```bash
cargo fmt --all
cargo clippy --all-targets
```

### Test

```bash
# Full test suite (preferred)
pkill -f solana-test-validator; sleep 2
solana-test-validator --deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM --reset --bind-address 127.0.0.1 --bpf-program tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz target/deploy/sss_token.so --bpf-program A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB target/deploy/sss_transfer_hook.so &
sleep 5
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"

# Single test file
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/reserve-attestation.ts"
```

### IDL Regeneration

```bash
anchor idl build -p sss_token 2>/dev/null > target/idl/sss_token.json
anchor idl build -p sss_transfer_hook 2>/dev/null > target/idl/sss_transfer_hook.json
anchor idl type target/idl/sss_token.json -o target/types/sss_token.ts
anchor idl type target/idl/sss_transfer_hook.json -o target/types/sss_transfer_hook.ts
```

After regenerating IDLs, copy updated types into `sdk/core/src/` and rebuild the SDK:

```bash
cd sdk/core && yarn build
```

### Commits

Use conventional commit messages:

```
feat(sss-token): add rate-limiting instruction with per-minter daily cap
fix(hook): handle missing blacklist PDA without panicking
docs: add SSS-3 confidential transfer draft spec
test(reserve-attestation): add undercollateralization auto-pause cases
```

Update `CHANGELOG.md` for any user-facing change.

---

## Implementing a New SSS Standard

New standards (SSS-3, SSS-4, …) should extend or compose with the existing programs. Follow this checklist.

### Step 1: Write the spec

Create `docs/SSS-<N>.md`. The spec must define:
- What compliance/feature gap the standard addresses
- New instructions added (name, accounts, args, errors)
- Any new PDA accounts and their seeds
- How the standard interacts with the transfer hook
- Which role types are required or newly introduced
- How SSS-2 instructions behave on an SSS-`<N>` token (fail gracefully or extend)

### Step 2: Add initialization parameters

In `programs/sss-token/src/instructions/initialize.rs`, extend `InitParams` with any new fields required by SSS-`<N>`. Gate them behind the standard level stored on `Config`.

### Step 3: Add new instructions

Each new instruction gets its own file under `programs/sss-token/src/instructions/`. Follow the existing pattern:

1. Define an `Accounts` struct with full constraint annotations.
2. Implement the handler function — validate roles first, then mutate state, then emit an event.
3. Register the instruction in `lib.rs`.
4. Add corresponding error variants to `errors.rs` if needed.

### Step 4: Write tests

Create `tests/e2e-sss<N>.ts`. The file must:
- Have a self-contained `before()` that initializes an SSS-`<N>` token.
- Cover the happy path for every new instruction.
- Cover all role-permission rejection cases.
- Cover edge cases specific to the standard (e.g., rate limit boundaries, expiry windows).

---

## Implementing a New Module

A module is a self-contained compliance or operational feature (e.g., transfer rate limiting, spend allowances, on-chain reporting).

### Step 1: Add the instruction

Add a new instruction file in `programs/sss-token/src/instructions/`. If the module interacts with transfers, consider whether it belongs in the hook program instead.

### Step 2: Define the PDA

Add a new account struct in `programs/sss-token/src/state/`. Choose deterministic seeds that scope the PDA to the mint (`config` or `mint` as the first seed component). Store the bump in the account struct.

### Step 3: Hook integration (if needed)

If the module must run on every transfer, add it to `programs/sss-transfer-hook/src/instructions/execute.rs`. Add the new PDA to `ExtraAccountMetas` during hook initialization.

### Step 4: SDK exposure

Add a method to `sdk/core/src/SssTokenClient.ts` (or a new client class) that wraps the instruction. Use `.accountsStrict()` and `BN` for all amounts.

### Step 5: Tests

Add tests to the relevant existing test file or create a new dedicated file. Every new module must have tests for: initialization, normal operation, and all rejection paths.

---

## Testing Requirements

- Every new instruction must have at least: one happy-path test, one unauthorized-role rejection test, and one invalid-input test.
- All tests must be self-contained. Do not rely on state leaked from other test files.
- Fund test keypairs via `SystemProgram.transfer`, not airdrop.
- Use `describe/it` nesting: `describe(feature) > describe(scenario) > it(expected behavior)`.
- Test names follow: `"verb + noun + expected outcome"` — e.g., `"rejects mint with zero amount"`.
- For expected-failure tests, use `try/catch` + `expect.fail()` rather than `.should.be.rejected`.
- The full suite must pass before opening a PR. The suite currently has 395 tests across 15 files.

---

## Code Standards

### Rust

- No `unwrap()`, no `panic!`, no `unreachable!`. Use `ok_or(SSSError::...)` or `?`.
- All arithmetic on `u64`/`u128` must use checked operations (`checked_add`, `checked_sub`, `checked_mul`, `checked_div`). Return `SSSError::MathOverflow` on failure.
- Store bumps in account structs. Never call `find_program_address` inside instruction handlers.
- Emit events at the **end** of every state-changing handler.
- Validate `config.mint == mint.key()` in every instruction. Validate `role.config` and `role.assignee` in every role-gated instruction.
- `UncheckedAccount` fields must have a `/// CHECK:` comment and manual validation in the handler.

### TypeScript

- Never use `any` except for `idl as any` in Anchor `Program` constructor calls.
- Use `BN` for all on-chain token amounts — never raw `number`.
- Always use `.accountsStrict()`, never `.accounts()`.
- Derive PDAs with `PublicKey.findProgramAddressSync()`.
- Include `TOKEN_2022_PROGRAM_ID` explicitly when creating or finding ATAs.
- Export all public interfaces and types from the SDK.

### Formatting

- Rust: `cargo fmt --all` (enforced by CI).
- TypeScript: Prettier with project config (enforced by CI).
- No trailing whitespace. No commented-out dead code in PRs.

---

## Security Rules

### Role validation

Every role-gated instruction must verify all three: the role account's `config` field matches the current config, the `role_type` matches the expected type, and the `assignee` matches the signer. Never skip any of these checks.

### PDA checks

Always verify that PDA-derived accounts were derived from the expected seeds and program. For cross-program calls (e.g., sss-token calling the hook to manage blacklist entries), use `invoke_signed` with config PDA signer seeds and verify `config.is_signer` in the hook.

### Token-2022 program pinning

Always use `token_2022::spl_token_2022` for CPIs. Never use the legacy `spl_token` program for Token-2022 mints. Explicitly pass `TOKEN_2022_PROGRAM_ID` in all ATA derivations.

### Auto-pause safety

The `paused` and `paused_by_attestation` flags are independent. `require_not_paused` must check both. `unpause` must clear both. Never add a code path that clears only one.

### Treasury protection

`freeze_account` must reject if the target account is the treasury ATA. This check must remain in any refactor of the freeze instruction.

---

## Pull Request Process

1. **Branch** from `main` using the naming convention above.
2. **Build and lint** — `anchor build`, `cargo fmt --all`, `cargo clippy --all-targets` must all pass cleanly.
3. **Test** — the full 395-test suite must pass. Add new tests for your changes.
4. **Update CHANGELOG.md** under the `[Unreleased]` section.
5. **Open a PR** against `main`. The PR description must include:
   - What the change does and why.
   - Any new instructions, PDAs, or error codes introduced.
   - Test coverage summary (files added/modified, approximate test count).
6. **CI checks** — all GitHub Actions checks must be green before merge.
7. **Review** — at least one maintainer approval required. Security-sensitive changes (role logic, hook execution, PDA derivation) require two approvals.

For questions or design discussions, open a GitHub Issue before starting implementation on large features.
