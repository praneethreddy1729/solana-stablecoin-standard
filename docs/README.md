# Solana Stablecoin Standard (SSS) - Documentation

The Solana Stablecoin Standard defines two specification levels for issuing regulated stablecoins on Solana using Token-2022:

- **SSS-1** -- Basic stablecoin with mint, burn, freeze, pause, and role-based access control
- **SSS-2** -- Compliance-enabled stablecoin adding transfer hook blacklists, permanent delegate seizure, and default-frozen accounts

## Quick Start

### Prerequisites

- Rust with Solana toolchain (Agave 3.0.x via `solana-install`)
- Anchor CLI 0.32.1
- Node.js 18+
- `cargo-build-sbf` symlinked into `~/.cargo/bin/`

### Build

```bash
PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH" CC=/usr/bin/cc anchor build
```

### Test

```bash
PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH" anchor test
```

The test validator automatically deactivates SIMD-0219 (feature `CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM`) in `Anchor.toml` to work around an Agave 3.0.x bug that breaks Token-2022 metadata realloc.

### Deploy

```bash
solana program deploy target/deploy/sss_token.so --program-id target/deploy/sss_token-keypair.json
solana program deploy target/deploy/sss_transfer_hook.so --program-id target/deploy/sss_transfer_hook-keypair.json
```

## Create an SSS-1 Stablecoin

```typescript
import { SolanaStablecoin, Preset } from "@sss/sdk";

const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,
  wallet,
  {
    name: "USD Coin",
    symbol: "USDC",
    uri: "https://example.com/usdc.json",
    decimals: 6,
    preset: Preset.SSS_1,
  }
);

// Assign roles
await stablecoin.updateRoles({
  roleType: RoleType.Minter,
  assignee: minterPubkey,
  isActive: true,
});
await stablecoin.updateMinterQuota({
  minterRole: minterRolePda,
  newQuota: new BN(1_000_000_000),
});

// Mint tokens
await stablecoin.mintTokens({
  amount: new BN(1_000_000),
  to: recipientAta,
  minter: minterPubkey,
});
```

## Create an SSS-2 Stablecoin (with Compliance)

```typescript
const { stablecoin } = await SolanaStablecoin.create(
  connection,
  wallet,
  {
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://example.com/rusd.json",
    decimals: 6,
    preset: Preset.SSS_2, // Enables transfer hook + permanent delegate
  }
);

// Compliance operations
await stablecoin.compliance.blacklistAdd({
  user: sanctionedAddress,
  blacklister: blacklisterPubkey,
});
await stablecoin.compliance.seize({
  from: sanctionedTokenAccount,
  to: treasuryAta,
});
```

## Program IDs

| Program | ID |
|---------|-----|
| sss-token | `8PRbAdtmGWZRjQJpsybTgojq5UkYsCSujTERY3QhC9LW` |
| sss-transfer-hook | `J9eLtU1WpAThPvysxzLKkYhoBZaMQJPwjNStTKSokJcf` |

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, PDA structure, Token-2022 extensions |
| [SSS-1 Specification](./SSS-1.md) | Basic stablecoin spec |
| [SSS-2 Specification](./SSS-2.md) | Compliance-enabled stablecoin spec |
| [SDK Reference](./SDK.md) | TypeScript SDK API |
| [Compliance](./COMPLIANCE.md) | Blacklist, seizure, OFAC integration |
| [Operations](./OPERATIONS.md) | Deployment and operational procedures |
| [API Reference](./API.md) | Backend REST API documentation |
| [Security](./SECURITY.md) | Security model and threat analysis |
| [Testing](./TESTING.md) | Test suite documentation |
| [Privacy](./PRIVACY.md) | ConfidentialTransfer incompatibility analysis |
