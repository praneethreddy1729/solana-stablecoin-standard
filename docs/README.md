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

### Docker

Run the backend API and frontend dashboard without installing any Solana toolchain:

```bash
cp .env.example .env
# Edit .env: set MINT_ADDRESS to your deployed mint, and SOLANA_RPC_URL to your RPC endpoint
docker compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

The keypair at `~/.config/solana/id.json` is mounted read-only into the backend container. To use a different keypair, set `AUTHORITY_KEYPAIR_PATH` in `.env` before running `docker compose up`.

## Create an SSS-1 Stablecoin

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,
  {
    name: "USD Coin",
    symbol: "USDC",
    uri: "https://example.com/usdc.json",
    decimals: 6,
    preset: Preset.SSS_1,
    authority: keypair,
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
await stablecoin.mint(
  recipientAta,
  new BN(1_000_000),
  minterPubkey,
);
```

## Create an SSS-2 Stablecoin (with Compliance)

```typescript
const { stablecoin } = await SolanaStablecoin.create(
  connection,
  {
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://example.com/rusd.json",
    decimals: 6,
    preset: Preset.SSS_2, // Enables transfer hook + permanent delegate
    authority: keypair,
  }
);

// Compliance operations
await stablecoin.compliance.blacklistAdd(
  sanctionedAddress,
  blacklisterPubkey,
);
await stablecoin.compliance.seize(
  sanctionedTokenAccount,
  treasuryAta,
);
```

## Program IDs

| Program | ID |
|---------|-----|
| sss-token | `tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz` |
| sss-transfer-hook | `A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB` |

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
| [CLI Reference](./CLI.md) | Full CLI command reference (18 commands) |
| [Privacy](./PRIVACY.md) | ConfidentialTransfer incompatibility analysis |
| [SSS-3 Specification](./SSS-3.md) | Private stablecoin spec (experimental) |
| [Oracle Price Guard](./ORACLE.md) | Pyth-based oracle integration and circuit breaker |
| [Regulatory](./REGULATORY.md) | MiCA, US, Brazil regulatory compliance mapping |
| [Error Codes](./ERRORS.md) | All error codes from both programs |
| [Events](./EVENTS.md) | All events emitted by sss-token |
