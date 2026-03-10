# Testing Documentation

## Overview

The test suite validates all SSS-1 and SSS-2 functionality through Anchor integration tests. Tests run against a local Solana validator with both programs deployed.

**Total: 347+ tests** across 15 test files covering all instructions, role checks, compliance flows, and edge cases.

## Running Tests

### Full Test Suite

```bash
PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH" anchor test
```

### With Verbose Output

```bash
anchor test -- --reporter spec
```

### Specific Test File

```bash
anchor test -- --grep "initialize"
```

## SIMD-0219 Deactivation (Agave 3.0.x Workaround)

Agave 3.0.x includes SIMD-0219 (Stricter ABI and Runtime Constraints) which breaks Token-2022 metadata realloc ([anza-xyz/agave#9799](https://github.com/anza-xyz/agave/issues/9799)). The `initialize` instruction creates the mint account with extension-only space but funds it for the full size (extensions + metadata). Token-2022 auto-reallocs during `initializeTokenMetadata`, which triggers the SIMD-0219 violation.

The `Anchor.toml` deactivates this feature gate automatically for the test validator:

```toml
[test.validator]
bind_address = "127.0.0.1"
deactivate_feature = ["CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM"]
```

Without this deactivation, `initialize` transactions will fail on Agave 3.0.x validators.

## Test Structure

Tests are located in the `tests/` directory:

```
tests/
  sss-token.ts              -- Main test suite (34 tests)
  sss-transfer-hook.ts      -- Transfer hook tests (5 tests)
  admin-extended.ts         -- Extended admin/role tests (15 tests)
  authority-pause-extended.ts -- Authority & pause tests (30 tests)
  compliance-extended.ts    -- Compliance flow tests (35 tests)
  edge-cases.ts             -- Edge case coverage (17 tests)
  multi-user.ts             -- Multi-user scenarios (15 tests)
  invariants.ts             -- Invariant checks (11 tests)
  full-lifecycle.ts         -- Full lifecycle scenarios (8 tests)
  role-matrix.ts            -- Role permission matrix (47 tests)
  token-ops-extended.ts     -- Extended token operations (40 tests)
  sdk-integration.ts        -- SDK integration tests (26 tests)
  e2e-sss1.ts               -- End-to-end SSS-1 lifecycle (1 test)
  e2e-sss2.ts               -- End-to-end SSS-2 lifecycle (1 test)
```

### sss-token.ts (34 tests)

Tests organized by describe block:

**initialize** (1 test)
- Creates SSS-1 stablecoin (no hook, no delegate)

**update_roles** (8 tests)
- Assigns Minter role (type 0)
- Assigns Burner role (type 1)
- Assigns Pauser role (type 2)
- Assigns Freezer role (type 3)
- Assigns Blacklister role (type 4)
- Assigns Seizer role (type 5)
- Rejects role update from non-authority
- Deactivates and reactivates a role

**update_minter** (2 tests)
- Sets minter quota
- Rejects quota update from non-authority

**mint** (4 tests)
- Mints tokens successfully
- Tracks minted_amount cumulatively
- Rejects mint exceeding quota
- Rejects mint when paused

**burn** (2 tests)
- Burns tokens successfully
- Rejects burn when paused

**freeze_account / thaw_account** (4 tests)
- Freezes an account
- Rejects freezing already frozen account
- Thaws a frozen account
- Rejects thawing non-frozen account

**pause / unpause** (5 tests)
- Pauses the token
- Rejects pause when already paused
- Rejects pause from wrong role
- Unpauses the token
- Rejects unpause when not paused

**transfer_authority / accept / cancel** (6 tests)
- Initiates authority transfer
- Rejects duplicate transfer initiation (already pending)
- Rejects accept from wrong signer
- Cancels authority transfer
- Rejects cancel when no transfer pending
- Accepts authority transfer (full flow)

**add_to_blacklist / remove_from_blacklist (SSS-2 on SSS-1)** (1 test)
- Rejects addToBlacklist on SSS-1 token (ComplianceNotEnabled)

**seize (SSS-2 on SSS-1)** (1 test)
- Rejects seize on SSS-1 token (PermanentDelegateNotEnabled)

### sss-transfer-hook.ts (5 tests)

Runs against a full SSS-2 token (transfer hook + permanent delegate enabled).

**initialize_extra_account_metas** (1 test)
- ExtraAccountMetas account was created

**transfers** (4 tests)
- Transfer succeeds for non-blacklisted accounts
- Transfer fails for blacklisted sender
- Transfer fails for blacklisted receiver
- Seize bypasses blacklist via permanent delegate

### admin-extended.ts (15 tests)

Extended coverage for admin operations, role management edge cases, and Seizer role.

### edge-cases.ts (17 tests)

Edge case coverage including zero amounts, boundary values, reason string validation (ReasonTooLong error 6024), and malformed inputs.

### multi-user.ts (15 tests)

Multi-user scenarios testing concurrent role holders, independent minter quotas, and multi-party compliance flows.

### invariants.ts (11 tests)

Invariant checks validating PDA derivation consistency, config immutability after init, and state machine correctness.

### full-lifecycle.ts (8 tests)

Full lifecycle scenarios covering various combinations of SSS-1 and SSS-2 features end-to-end.

### authority-pause-extended.ts (30 tests)

Extended coverage for authority transfer edge cases and pause/unpause interaction with all operations.

### compliance-extended.ts (35 tests)

Comprehensive compliance testing including blacklist reason validation, CPI flow edge cases, and seize permission checks.

### role-matrix.ts (47 tests)

Full role permission matrix ensuring every instruction correctly accepts authorized roles and rejects unauthorized ones.

### token-ops-extended.ts (40 tests)

Extended token operation tests covering mint quota boundaries, burn edge cases, freeze/thaw interactions, and multi-operation sequences.

### sdk-integration.ts (26 tests)

SDK integration tests verifying the TypeScript SDK correctly wraps all on-chain instructions and handles errors.

### e2e-sss1.ts (1 test)

Single end-to-end test that exercises the complete SSS-1 lifecycle:
initialize -> assign roles -> set quota -> mint -> burn -> freeze -> thaw -> pause -> unpause -> authority transfer

### e2e-sss2.ts (1 test)

Single end-to-end test covering the full SSS-2 lifecycle:
initialize (with hook + delegate) -> setup ExtraAccountMetas -> assign roles -> mint -> transfer -> blacklist (with reason) -> verify transfer blocked -> seize (via Seizer role) -> verify seized

## Fuzz Testing (Trident)

Fuzz targets are defined in `trident-tests/fuzz_tests/fuzz_sss_token.rs` using the [Trident](https://ackee.xyz/trident/docs/latest/) framework. Trident generates randomized inputs for each program instruction and verifies that on-chain invariants hold under adversarial conditions.

### Running Fuzz Tests

```bash
# Install Trident CLI (requires Rust nightly)
cargo install trident-cli

# Run fuzz campaign
trident fuzz run fuzz_sss_token
```

> **Note:** Full fuzz execution requires `trident-cli` and may be incompatible with some Anchor versions. The fuzz stubs compile-gate behind `#[cfg(feature = "fuzz")]` so they do not affect normal builds.

### Fuzz Targets and Invariants

| Target | Instruction(s) | Invariants Checked |
|--------|----------------|-------------------|
| `fuzz_initialize` | `initialize` | Config PDA derivation, decimals <= 18, name/symbol/URI bounds, extension flags |
| `fuzz_mint` | `mint` | Quota enforcement (minted_amount + amount <= quota), checked_add overflow, supply tracking, pause rejection |
| `fuzz_burn` | `burn` | Cannot burn > balance, supply decreases by exact amount, pause rejection |
| `fuzz_roles` | `update_roles` | Authority-only access, role type range 0-6, deactivated role rejection |
| `fuzz_blacklist` | `add_to_blacklist`, `remove_from_blacklist`, `seize` | Sender/receiver blacklist enforcement, seize bypass via permanent delegate, reason string <= 64 bytes |
| `fuzz_attestation` | `attest_reserves` | u128 intermediate ratio calc no overflow, auto-pause when reserves < supply, auto-unpause when reserves >= supply, positive expiry |

### Configuration

Fuzz configuration lives in `Trident.toml` at the project root:

```toml
[fuzz.test.fuzz_sss_token]
fuzz_iterations = 10000
programs_owned = ["tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz"]
```

## Test Setup Pattern

```typescript
describe("sss-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken;
  const hookProgram = anchor.workspace.SssTransferHook;

  const authority = provider.wallet.payer;
  const mint = Keypair.generate();

  // Role holders (separate keypairs)
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const pauser = Keypair.generate();
  const freezer = Keypair.generate();
  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const recipient = Keypair.generate();

  before(async () => {
    // Airdrop SOL to all signers
    // Derive PDAs
  });

  // Tests organized by feature...
});
```

### Key Testing Patterns

1. **Airdrop before tests**: All signers receive SOL in the `before` hook
2. **PDA derivation**: PDAs are derived using `PublicKey.findProgramAddressSync`
3. **Error assertions**: Failed transactions check `e.error.errorCode.code`
4. **Sequential dependencies**: Tests within a describe block run sequentially (state depends on prior tests)

## Anchor.toml Test Configuration

```toml
[toolchain]
anchor_version = "0.32.1"
package_manager = "yarn"

[programs.localnet]
sss_token = "tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz"
sss_transfer_hook = "A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB"

[test.validator]
bind_address = "127.0.0.1"
deactivate_feature = ["CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM"]

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/**/*.ts\""
```
