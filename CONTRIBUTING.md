# Contributing to the Solana Stablecoin Standard (SSS)

## Prerequisites

- Rust 1.84+, Solana CLI 2.2+, Anchor 0.32+, Node.js 20+, Yarn

## Build

```bash
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard && yarn install
PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/local/bin:$PATH" CC=/usr/bin/cc anchor build
```

## Test

```bash
pkill -f solana-test-validator; sleep 2
solana-test-validator --deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM --reset --bind-address 127.0.0.1 --bpf-program tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz target/deploy/sss_token.so --bpf-program A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB target/deploy/sss_transfer_hook.so &
sleep 5
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

> The `--deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM` flag is required — Agave 3.0.x SIMD-0219 breaks Token-2022 metadata realloc without it.

## Code Standards

### Rust

- No `unwrap()`, `panic!`, or `unreachable!` — use `ok_or(SSSError::...)` or `?`.
- All `u64`/`u128` arithmetic must use checked operations; return `SSSError::MathOverflow` on failure.
- Store bumps in account structs; never call `find_program_address` inside handlers.
- Emit events at the end of every state-changing handler.
- Every `UncheckedAccount` must have a `/// CHECK:` comment and manual validation.
- Format: `cargo fmt --all` and `cargo clippy --all-targets` must pass.

### TypeScript

- Never use `any` except `idl as any` in Anchor `Program` constructor calls.
- Use `BN` for all on-chain token amounts; always use `.accountsStrict()`.
- Derive PDAs with `PublicKey.findProgramAddressSync()`.
- Format: Prettier with project config.

## Testing Requirements

- Every new instruction needs: a happy-path test, an unauthorized-role rejection test, and an invalid-input test.
- All tests must be self-contained — no shared state between test files.
- Fund keypairs via `SystemProgram.transfer`, not airdrop.
- Use `describe/it` nesting: `describe(feature) > describe(scenario) > it(behavior)`.
- Test names: `"verb + noun + expected outcome"` (e.g., `"rejects mint with zero amount"`).
- The full 577-test suite (395 integration + 135 SDK + 47 property-based) must pass before opening a PR.

## Commit Conventions

Use conventional commits:

```
feat(sss-token): add rate-limiting instruction
fix(hook): handle missing blacklist PDA without panicking
test(reserve-attestation): add undercollateralization auto-pause cases
```

Update `CHANGELOG.md` under `[Unreleased]` for any user-facing change.

## Pull Request Process

1. Branch from `main`: `<type>/<scope>-<description>` (e.g., `feat/sss-token-rate-limiting`).
2. Build, lint, and run the full test suite.
3. Open a PR against `main` describing what changed, any new instructions/PDAs/errors, and test coverage.
4. All CI checks must be green. Security-sensitive changes require two maintainer approvals.
