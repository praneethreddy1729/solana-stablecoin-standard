# Oracle Price Guard

Oracle Price Guard provides a second independent safety layer alongside Reserve Attestation for the Solana Stablecoin Standard.

While **Reserve Attestation** guards against reserve shortfalls (reserves < supply), **Oracle Price Guard** guards against market depegs (oracle price deviates from target peg). Together they provide comprehensive protection for stablecoin operations.

## Architecture

Oracle Price Guard operates entirely at the SDK level — no new on-chain program deployment is required. It reads Pyth price feeds via the Hermes HTTP API (default) or by parsing on-chain Pyth V2 price accounts, and implements client-side circuit breaker logic that can block minting when a depeg is detected.

```
┌──────────────────────────────────────────────────┐
│                Stablecoin SDK                     │
│                                                   │
│  ┌─────────────────┐   ┌──────────────────────┐  │
│  │ Reserve          │   │  Oracle Price Guard   │  │
│  │ Attestation      │   │  (Pyth feeds)         │  │
│  │                  │   │                       │  │
│  │ Guards against:  │   │  Guards against:      │  │
│  │ reserves < supply│   │  price != target peg  │  │
│  │                  │   │                       │  │
│  │ On-chain (PDA)   │   │  SDK-level            │  │
│  └─────────────────┘   └──────────────────────┘  │
│                                                   │
│  Both must pass before minting is allowed.        │
└──────────────────────────────────────────────────┘
```

## Quick Start

### SDK Usage

```typescript
import { OraclePriceGuard, PYTH_FEED_IDS } from "@stbr/sss-token";

// Create a guard for USDC/USD
const guard = new OraclePriceGuard({
  pythFeed: PYTH_FEED_IDS["USDC/USD"],
  targetPrice: 1.0,          // Target peg: $1.00
  maxDeviationBps: 200,      // Max 2% deviation
  maxStalenessSecs: 60,      // 60s max price age
  circuitBreakerThreshold: 3, // Trip after 3 consecutive deviations
});

// Single price check
const check = await guard.checkPrice();
console.log(`Price: $${check.currentPrice}, Deviation: ${check.deviationBps}bps`);

// Validate before minting
const result = await guard.validateMintPrice();
if (!result.allowed) {
  throw new Error(`Minting blocked: ${result.reason}`);
}

// Get full status
const status = guard.getStatus();
```

### Integration with SolanaStablecoin

```typescript
import { SolanaStablecoin, OraclePriceGuard, PYTH_FEED_IDS } from "@stbr/sss-token";

const stablecoin = await SolanaStablecoin.load(connection, wallet, mintAddress);

// Create oracle guard
const oracle = new OraclePriceGuard({
  pythFeed: PYTH_FEED_IDS["USDC/USD"],
  targetPrice: 1.0,
  maxDeviationBps: 200,
  maxStalenessSecs: 60,
  circuitBreakerThreshold: 3,
});

// Check oracle before minting
const { allowed, reason } = await oracle.validateMintPrice();
if (!allowed) throw new Error(reason);

// Also check reserve attestation
const ratio = await stablecoin.getCollateralizationRatio();
if (ratio !== null && ratio < 100) throw new Error("Undercollateralized");

// Both checks passed — safe to mint
await stablecoin.mint(recipientAta, amount, minterPubkey);
```

### Continuous Monitoring

```typescript
const guard = new OraclePriceGuard({ ... });

// Register alert callback
guard.onAlert((alert) => {
  console.log(`[${alert.severity}] ${alert.message}`);
  // Send to Slack, PagerDuty, etc.
});

// Start monitoring (polls every 10 seconds)
const stop = guard.startMonitoring(10_000);

// Later: stop monitoring
stop();
```

## CLI Commands

### Check Oracle Status

```bash
sss-token oracle status --feed USDC/USD
sss-token oracle status --feed 0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a
sss-token oracle status --feed USDC/USD --target 1.0 --max-deviation 200 --format json
```

### Run Continuous Guard

```bash
sss-token oracle guard --feed USDC/USD --target 1.0 --max-deviation 200 --interval 10000
```

### Validate Before Minting

```bash
sss-token oracle validate-mint --feed USDC/USD
# Exit code 0 = allowed, 1 = blocked
```

### List Known Feed IDs

```bash
sss-token oracle feeds
sss-token oracle feeds --format json
```

## Configuration

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `pythFeed` | `string \| PublicKey` | Pyth feed ID (hex string) or on-chain price account | Required |
| `targetPrice` | `number` | Target peg price | Required |
| `maxDeviationBps` | `number` | Max deviation in basis points (100 = 1%) | Required |
| `maxStalenessSecs` | `number` | Max acceptable price age in seconds | Required |
| `circuitBreakerThreshold` | `number` | Consecutive deviations to trip breaker | Required |
| `useHermesApi` | `boolean` | Use Pyth Hermes HTTP API | `true` |
| `hermesBaseUrl` | `string` | Custom Hermes API URL | `https://hermes.pyth.network` |
| `rpcUrl` | `string` | Solana RPC URL (for on-chain reads) | — |

## Circuit Breaker Logic

1. Each `checkPrice()` call fetches the latest Pyth price.
2. If the price deviates from the target by more than `maxDeviationBps`, OR if the price is stale (older than `maxStalenessSecs`), a consecutive deviation counter increments.
3. If the counter reaches `circuitBreakerThreshold`, the circuit breaker trips and `circuitBreakerActive` becomes `true`.
4. When the price returns within threshold, the counter resets to 0 and the circuit breaker deactivates.
5. Manual reset is available via `guard.resetCircuitBreaker()`.

## Pyth Feed IDs

| Pair | Feed ID |
|------|---------|
| USDC/USD | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| USDT/USD | `0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b` |
| SOL/USD | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| DAI/USD | `0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd` |
| EUR/USD | `0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b` |
| BRL/USD | `0xe14d95a4fad220e3521a205ce0e823e4dbc8b1f16b36c93ab48e8a5f5e9dd7f1` |

Full list: use `sss-token oracle feeds` or `PYTH_FEED_IDS` from the SDK.
