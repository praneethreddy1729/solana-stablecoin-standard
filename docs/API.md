# Backend API Reference

## Overview

The SSS backend is a Fastify server that wraps the on-chain programs with REST endpoints for minting, burning, compliance screening, and status monitoring. It uses the `SolanaStablecoin` SDK class internally and signs transactions with a server-side authority keypair.

Source: `backend/src/index.ts`

## Configuration

The backend is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | Solana RPC endpoint |
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `AUTHORITY_KEYPAIR` | `~/.config/solana/id.json` | Path to authority keypair file |
| `MINT_ADDRESS` | (required) | The mint address to manage |
| `ENABLE_SANCTIONS_SCREENING` | `false` | Enable OFAC screening on mint |
| `SANCTIONS_API_URL` | (none) | External sanctions API URL |

## Startup

The backend:
1. Loads the authority keypair from disk
2. Requires `MINT_ADDRESS` env var (exits if missing)
3. Calls `SolanaStablecoin.load()` to connect to the existing stablecoin
4. Starts an `EventPoller` that polls config PDA changes every 5 seconds
5. Registers all route handlers
6. Starts listening on `HOST:PORT`

## Endpoints

### GET /health

Health check with RPC connectivity and mint status.

**Response** (200):
```json
{
  "status": "ok",
  "rpc": {
    "connected": true,
    "endpoint": "http://127.0.0.1:8899",
    "slot": 12345
  },
  "mint": {
    "address": "MintBase58Address",
    "exists": true,
    "supply": "1000000000"
  }
}
```

**Response** (503 -- degraded):
```json
{
  "status": "degraded",
  "rpc": {
    "connected": false,
    "endpoint": "http://127.0.0.1:8899",
    "error": "Connection refused"
  }
}
```

Source: `backend/src/routes/health.ts`

### GET /status

Fetch mint info and parsed config PDA data.

**Response** (200):
```json
{
  "mint": {
    "address": "MintBase58Address",
    "decimals": 6,
    "supply": "1000000000",
    "isInitialized": true,
    "freezeAuthority": "ConfigPdaBase58",
    "mintAuthority": "ConfigPdaBase58"
  },
  "config": {
    "authority": "AuthorityBase58",
    "mint": "MintBase58Address",
    "paused": false,
    "enableTransferHook": true,
    "enablePermanentDelegate": true,
    "defaultAccountFrozen": false
  }
}
```

The config is parsed from raw account bytes (skipping 8-byte Anchor discriminator) at known offsets. Returns `config: null` if the config PDA cannot be fetched or parsed.

Source: `backend/src/routes/status.ts`

### POST /mint

Mint tokens to a recipient address. The backend derives the recipient's ATA, constructs the transaction, and submits it signed by the server authority (who must have the Minter role).

**Request Body**:
```json
{
  "to": "RecipientWalletBase58",
  "amount": "1000000"
}
```

**Validation**:
- `to` and `amount` are required (400 if missing)
- `to` must be a valid Solana public key (400 if invalid)
- `amount` must be a positive integer string (400 if invalid)
- If `ENABLE_SANCTIONS_SCREENING=true`, the `to` address is screened before minting (403 if sanctioned)

**Response** (200):
```json
{
  "signature": "TransactionSignatureBase58",
  "mint": "MintBase58Address",
  "to": "RecipientWalletBase58",
  "amount": "1000000"
}
```

**Response** (403 -- sanctioned):
```json
{
  "error": "Address is sanctioned",
  "screening": {
    "address": "RecipientWalletBase58",
    "sanctioned": true,
    "timestamp": 1709650000000,
    "source": "external"
  }
}
```

Source: `backend/src/routes/mint.ts`

### POST /burn

Burn tokens from a token account. Requires the token account owner's public key for co-signing.

**Request Body**:
```json
{
  "from": "TokenAccountBase58",
  "fromAuthority": "TokenAccountOwnerBase58",
  "amount": "1000000"
}
```

**Validation**:
- All three fields required (400 if missing)
- Addresses must be valid public keys (400 if invalid)
- Amount must be a positive integer string (400 if invalid)

**Response** (200):
```json
{
  "signature": "TransactionSignatureBase58",
  "mint": "MintBase58Address",
  "from": "TokenAccountBase58",
  "amount": "1000000"
}
```

Source: `backend/src/routes/burn.ts`

### POST /compliance/screen

Screen an address against the sanctions list.

**Request Body**:
```json
{
  "address": "WalletBase58"
}
```

**Response** (200):
```json
{
  "address": "WalletBase58",
  "sanctioned": false,
  "timestamp": 1709650000000,
  "source": "mock"
}
```

The `source` field indicates whether the result came from an `"external"` sanctions API (if `SANCTIONS_API_URL` is configured) or the `"mock"` built-in list.

Source: `backend/src/routes/compliance.ts`, `backend/src/services/compliance.ts`

### GET /compliance/audit

Retrieve the in-memory audit log of all screening results.

**Query Parameters**:
- `limit` (default: 100, max: 500)
- `offset` (default: 0)

**Response** (200):
```json
{
  "total": 42,
  "limit": 100,
  "offset": 0,
  "entries": [
    {
      "address": "WalletBase58",
      "sanctioned": false,
      "timestamp": 1709650000000,
      "source": "mock"
    }
  ]
}
```

Source: `backend/src/routes/compliance.ts`

### GET /events

Retrieve polled events from the EventPoller.

**Query Parameters**:
- `limit` (default: 50, max: 200)
- `offset` (default: 0)

**Response** (200):
```json
{
  "total": 100,
  "limit": 50,
  "offset": 0,
  "events": [...]
}
```

Source: `backend/src/index.ts` (inline route)

## CORS

The backend sets permissive CORS headers on all requests:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

OPTIONS requests return 204 immediately.

## Authentication

The current backend implementation has **no authentication**. All endpoints are publicly accessible. For production deployments, add authentication middleware (e.g., API keys, JWT) before exposing the server.

## Error Format

Errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "details": "Underlying error message (optional)"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (missing/invalid parameters) |
| 403 | Forbidden (sanctions screening failed) |
| 500 | Internal server error (transaction failed, RPC error, config missing) |

## Running the Backend

```bash
cd backend
npm install
MINT_ADDRESS=<your-mint> npm start
```

Required: a deployed stablecoin with the authority keypair available at the configured path.

---

## CLI Command Reference

The `sss-token` CLI provides 13 commands for managing stablecoins from the terminal.

### Usage

```bash
cd sdk/cli
npx ts-node src/index.ts <command> [options]
```

Or if installed globally:

```bash
sss-token <command> [options]
```

### Commands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `init` | Create a new stablecoin | `--name`, `--symbol`, `--decimals`, `--preset SSS-1\|SSS-2` |
| `mint` | Mint tokens to an address | `--mint`, `--to`, `--amount` |
| `burn` | Burn tokens from an account | `--mint`, `--from`, `--amount` |
| `freeze` | Freeze a token account | `--mint`, `--account` |
| `thaw` | Thaw a frozen token account | `--mint`, `--account` |
| `pause` | Pause all operations | `--mint` |
| `unpause` | Resume operations | `--mint` |
| `blacklist add` | Add address to blacklist | `--mint`, `--user`, `--reason` |
| `blacklist remove` | Remove address from blacklist | `--mint`, `--user` |
| `blacklist check` | Check if address is blacklisted | `--mint`, `--user` |
| `seize` | Seize tokens from blacklisted account | `--mint`, `--from`, `--to` |
| `status` | Show stablecoin config and state | `--mint` |
| `supply` | Show current token supply | `--mint` |
| `minters` | List minters and their quotas | `--mint` |
| `holders` | List all token holders | `--mint` |
| `audit-log` | View on-chain event history | `--mint` |

All commands accept `--rpc-url` and `--keypair` options.

### Blacklist Subcommands

```bash
# Add to blacklist with reason
sss-token blacklist add --mint <MINT> --user <WALLET> --reason "OFAC SDN List"

# Remove from blacklist
sss-token blacklist remove --mint <MINT> --user <WALLET>

# Check blacklist status
sss-token blacklist check --mint <MINT> --user <WALLET>
```
