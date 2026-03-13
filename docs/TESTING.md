# Testing Documentation

## Overview

The test suite validates all SSS-1 and SSS-2 functionality through Anchor integration tests. Tests run against a local Solana validator with both programs deployed.

**Total: 615 tests** (395 integration + 173 SDK unit + 47 property-based) across 16 integration test files + SDK unit tests + property-based fuzz tests covering all instructions, role checks, compliance flows, and edge cases.

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
  sss-transfer-hook.ts      -- Transfer hook tests (15 tests)
  admin-roles.ts            -- Extended admin/role tests (15 tests)
  authority-pause.ts        -- Authority & pause tests (30 tests)
  compliance-flows.ts       -- Compliance flow tests (38 tests)
  edge-cases.ts             -- Edge case coverage (17 tests)
  multi-user.ts             -- Multi-user scenarios (15 tests)
  invariants.ts             -- Invariant checks (11 tests)
  full-lifecycle.ts         -- Full lifecycle scenarios (8 tests)
  role-matrix.ts            -- Role permission matrix (103 tests, dynamically generated)
  token-ops-edge.ts         -- Extended token operations (40 tests)
  sdk-integration.ts        -- SDK integration tests (26 tests)
  reserve-attestation.ts    -- Reserve attestation tests (11 tests)
  registry.ts               -- Stablecoin registry tests (2 tests)
  e2e-sss1.ts               -- End-to-end SSS-1 lifecycle (17 tests)
  e2e-sss2.ts               -- End-to-end SSS-2 lifecycle (13 tests)
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

### sss-transfer-hook.ts (15 tests)

Runs against a full SSS-2 token (transfer hook + permanent delegate enabled).

**initialize_extra_account_metas** (1 test)
- ExtraAccountMetas account was created

**blacklist entry management** (5 tests)
- Create blacklist entry with reason
- Create blacklist entry with max-length reason (64 bytes)
- Reject blacklist entry with reason too long (>64 bytes)
- Reject double-blacklisting same user (account already exists)
- Reject removing non-existent blacklist entry

**transfers** (4 tests)
- Transfer succeeds for non-blacklisted accounts
- Transfer fails for blacklisted sender
- Transfer fails for blacklisted receiver
- Verify hook allows transfer when neither party blacklisted

**update_extra_account_metas** (4 tests)
- Successfully updates extra account metas when called by authority
- Transfers still work after update_extra_account_metas
- Rejects update_extra_account_metas from non-authority signer
- Rejects update_extra_account_metas with wrong config PDA

**seize via permanent delegate** (1 test)
- Seize bypasses blacklist via permanent delegate

### admin-roles.ts (15 tests)

Extended coverage for admin operations, role management edge cases, and Seizer role.

### edge-cases.ts (17 tests)

Edge case coverage including zero amounts, boundary values, reason string validation (ReasonTooLong error 6024), and malformed inputs.

### multi-user.ts (15 tests)

Multi-user scenarios testing concurrent role holders, independent minter quotas, and multi-party compliance flows.

### invariants.ts (11 tests)

Invariant checks validating PDA derivation consistency, config immutability after init, and state machine correctness.

### full-lifecycle.ts (8 tests)

Full lifecycle scenarios covering various combinations of SSS-1 and SSS-2 features end-to-end.

### authority-pause.ts (30 tests)

Extended coverage for authority transfer edge cases and pause/unpause interaction with all operations.

### compliance-flows.ts (38 tests)

Comprehensive compliance testing including blacklist reason validation, CPI flow edge cases, and seize permission checks.

### role-matrix.ts (103 tests, dynamically generated)

Full role permission matrix ensuring every instruction correctly accepts authorized roles and rejects unauthorized ones. Uses `for` loops to generate per-role rejection tests dynamically.

### token-ops-edge.ts (40 tests)

Extended token operation tests covering mint quota boundaries, burn edge cases, freeze/thaw interactions, and multi-operation sequences.

### sdk-integration.ts (26 tests)

SDK integration tests verifying the TypeScript SDK correctly wraps all on-chain instructions and handles errors.

### reserve-attestation.ts (11 tests)

Tests for the reserve attestation and auto-pause mechanism:
- Attestor role assignment and validation
- Reserve attestation submission with valid proof
- Auto-pause when reserves drop below token supply (undercollateralized)
- Auto-unpause when reserves meet or exceed token supply
- Attestation URI validation (max 256 bytes)
- Expiration validation (must be positive)
- Unauthorized attestation rejection (non-attestor signer)
- Collateralization ratio calculation accuracy
- Multiple sequential attestations
- Attestation interaction with manual pause/unpause
- Edge cases for reserve amounts at boundary values

### e2e-sss1.ts (17 tests)

End-to-end tests exercising the complete SSS-1 lifecycle:
initialize -> assign roles -> set quota -> mint -> verify balance -> burn -> verify balance -> freeze -> reject mint to frozen -> thaw -> pause -> reject mint while paused -> unpause -> authority transfer -> accept -> verify new authority -> final state check

### e2e-sss2.ts (13 tests)

End-to-end tests covering the full SSS-2 lifecycle:
initialize (with hook + delegate) -> setup ExtraAccountMetas -> assign roles -> create ATAs + mint -> transfer between clean users -> blacklist with reason -> verify transfer blocked (sender) -> verify transfer blocked (receiver) -> seize via permanent delegate -> verify seized amount -> remove from blacklist -> transfer succeeds after removal -> final state integrity

## Property-Based / Fuzz Testing

Property-based test invariants are defined in `trident-tests/fuzz_tests/fuzz_sss_token.rs` with planned migration to the [Trident](https://ackee.xyz/trident/docs/latest/) framework when Anchor 0.32 compatibility is available. Current coverage relies on 395 integration tests covering the same invariants, supplemented by **47 property-based test functions** that exercise ~25,000+ randomized iterations against a local simulation of on-chain logic.

### Status

The Trident fuzz framework does not yet support Anchor 0.32.x. Rather than leaving empty scaffolds, we implemented real property-based tests using standard Rust `#[test]` infrastructure with a deterministic xorshift64 PRNG. These tests validate the exact same invariants a Trident harness would check, using simulated instruction logic that mirrors the on-chain handlers. When Trident compatibility arrives, each `simulate_*` function maps directly to a Trident `IxOps::check()` implementation.

### Fuzz Modules and Invariants (47 tests)

| Module | Tests | Instruction(s) | Invariants Verified |
|--------|-------|----------------|-------------------|
| `fuzz_initialize` | 6 | `initialize` | Decimals [0,18] bounds, name/symbol/URI length limits, compliance_level derivation from flags, config initial state (paused=false) |
| `fuzz_mint` | 8 | `mint` | Zero amount rejection, pause/attestation-pause blocking, inactive role rejection, quota enforcement at exact boundaries, u64 overflow protection, supply tracking consistency |
| `fuzz_burn` | 5 | `burn` | Zero burn rejection, underflow prevention (amount > balance), pause checks, monotonically decreasing supply, exact boundary values |
| `fuzz_roles` | 6 | `update_roles` | Invalid role_type (>=7) rejection, activation/deactivation correctness, toggle idempotency, independent role holders, deactivated role blocks actions, PDA seed uniqueness |
| `fuzz_blacklist` | 7 | `add/remove_from_blacklist`, `seize` | Reason string <=64 bytes, SSS-1 compliance rejection, sender+receiver blocking, removal restores transfers, seize bypasses blacklist, remove non-blacklisted fails, random add/remove sequence consistency |
| `fuzz_attestation` | 11 | `attest_reserves` | Non-positive expiration rejection, URI <=256 bytes, auto-pause when reserves < supply, exact boundary (reserve==supply => not paused), u128 ratio calculation no overflow, ratio accuracy verification, zero supply = 100%, expiry timestamp arithmetic, independence from manual pause, inactive attestor rejection, random sequential attestation consistency |
| `fuzz_cross_module` | 3 | Multiple | Token conservation (minted - burned == supply), dual pause flag blocks all operations, failure atomicity (no partial state updates) |

### Migration Path to Trident

When Trident supports Anchor 0.32.x:

1. Each `simulate_*` function becomes the body of `IxOps::check()` for that instruction.
2. Random input generation (`Xorshift64`) is replaced by Trident's built-in fuzzer (honggfuzz/AFL).
3. The `struct FuzzInitArgs` / `MinterState` / etc. map to Trident's `FuzzAccounts` and `IxData` types.
4. Invariant assertions remain identical -- they are the property specifications.

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
