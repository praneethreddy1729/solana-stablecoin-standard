# Deployment Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.79+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Solana CLI | 2.1+ | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor CLI | 0.32.1 | `cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.32.1 && avm use 0.32.1` |
| Node.js | 18+ | Required for tests and SDK |
| Yarn | 1.22+ | `npm install -g yarn` |

## Building Programs

```bash
# Build both programs
anchor build

# If only one builds, explicitly build the other
anchor build -p sss-token
anchor build -p sss_transfer_hook
```

Build artifacts land in `target/deploy/`:
- `sss_token.so` (main stablecoin program)
- `sss_transfer_hook.so` (transfer hook program)

## Deploying to Devnet

**Order matters**: deploy the hook program first, then the main program.

### 1. Configure CLI for devnet

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json
```

### 2. Fund your deployer wallet

```bash
solana airdrop 5
```

### 3. Deploy hook program first

```bash
solana program deploy target/deploy/sss_transfer_hook.so --program-id A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB
```

### 4. Deploy main token program

```bash
solana program deploy target/deploy/sss_token.so --program-id tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
```

### 5. Generate and publish IDL (optional)

```bash
anchor idl build -p sss_token 2>/dev/null > target/idl/sss_token.json
anchor idl build -p sss_transfer_hook 2>/dev/null > target/idl/sss_transfer_hook.json
```

## Deploying to Mainnet

### Considerations

- **Authority management**: Use a multisig (e.g., Squads) as upgrade authority, not a hot wallet.
- **Cost**: Mainnet deploys require real SOL. Budget ~5 SOL for both programs.
- **Audit**: Ensure a security audit is complete before mainnet deployment.

### Steps

```bash
solana config set --url mainnet-beta
solana config set --keypair /path/to/mainnet-deployer.json

# Deploy hook first
solana program deploy target/deploy/sss_transfer_hook.so --program-id A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB

# Deploy main program
solana program deploy target/deploy/sss_token.so --program-id tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
```

### Transfer upgrade authority to multisig

```bash
solana program set-upgrade-authority tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz --new-upgrade-authority <MULTISIG_ADDRESS>
solana program set-upgrade-authority A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB --new-upgrade-authority <MULTISIG_ADDRESS>
```

## Verifying Deployment

```bash
# Confirm programs are deployed and executable
solana program show tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
solana program show A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB

# Run integration tests against the deployed programs
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

## Upgrading Programs

### Buffer-based upgrade (recommended)

```bash
# Write new program to a buffer account
solana program write-buffer target/deploy/sss_token.so

# Deploy from buffer (requires upgrade authority signature)
solana program deploy --buffer <BUFFER_ADDRESS> --program-id tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
```

### Close buffer accounts to reclaim SOL

```bash
solana program close --buffers
```

## Environment Setup

Create a `.env` file in the project root (see `.env.example`):

```env
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
ANCHOR_WALLET=~/.config/solana/id.json
SSS_TOKEN_PROGRAM_ID=tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
SSS_HOOK_PROGRAM_ID=A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB
```

## Known Issues

- **Agave 3.0.x SIMD-0219**: Breaks Token-2022 metadata reallocation. For local testing, deactivate feature `CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM` in `Anchor.toml` or pass `--deactivate-feature` to the validator.
- **cargo-build-sbf**: Must be symlinked into `~/.cargo/bin/` for Anchor to locate it.
- **IDL generation**: `anchor idl build` in 0.32.1 may mix compile output with JSON; extract the JSON line starting with `{`.
