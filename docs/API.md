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
| `ENABLE_SANCTIONS_SCREENING` | `false` | Enable OFAC screening on mint/burn/blacklist |
| `SANCTIONS_API_URL` | (none) | External sanctions API URL |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `API_KEY` | (none) | Bearer token required on protected routes; if unset, all requests are allowed (dev mode) |
| `RATE_LIMIT_MAX` | `100` | Maximum requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |

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
    "pausedByAttestation": false,
    "enableTransferHook": true,
    "enablePermanentDelegate": true,
    "defaultAccountFrozen": false,
    "decimals": 6
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
  "source": "mock",
  "onChainBlacklisted": false
}
```

The `source` field indicates whether the result came from an `"external"` sanctions API (if `SANCTIONS_API_URL` is configured) or the `"mock"` built-in list. `onChainBlacklisted` reflects a live lookup against the on-chain BlacklistEntry PDA.

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

### POST /compliance/blacklist/add

Add an address to the on-chain blacklist. Requires the authority to hold the Blacklister role. Optionally screens the address against the sanctions list first (if `ENABLE_SANCTIONS_SCREENING=true`).

**Authentication**: Required (`Authorization: Bearer <key>`).

**Request Body**:
```json
{
  "address": "WalletBase58",
  "reason": "Optional reason string (max 64 bytes)"
}
```

**Validation**:
- `address` is required (400 if missing or invalid public key)
- `reason` is optional
- If `ENABLE_SANCTIONS_SCREENING=true`, the address is screened before blacklisting (403 if sanctioned, 503 if screening service unavailable)

**Response** (200):
```json
{
  "signature": "TransactionSignatureBase58",
  "address": "WalletBase58",
  "reason": "Optional reason string"
}
```

Source: `backend/src/routes/compliance.ts`

### POST /compliance/blacklist/remove

Remove an address from the on-chain blacklist.

**Authentication**: Required (`Authorization: Bearer <key>`).

**Request Body**:
```json
{
  "address": "WalletBase58"
}
```

**Validation**:
- `address` is required (400 if missing or invalid public key)

**Response** (200):
```json
{
  "signature": "TransactionSignatureBase58",
  "address": "WalletBase58"
}
```

Source: `backend/src/routes/compliance.ts`

### GET /compliance/audit/actions

Retrieve the in-memory action audit log (mints, burns, blacklist adds/removes). Separate from the screening audit log returned by `GET /compliance/audit`.

**Authentication**: Required (`Authorization: Bearer <key>`).

**Query Parameters**:
- `limit` (default: 100, max: 500)
- `offset` (default: 0)

**Response** (200):
```json
{
  "total": 10,
  "limit": 100,
  "offset": 0,
  "entries": [
    {
      "timestamp": "2024-03-05T12:00:00.000Z",
      "action": "mint",
      "actor": "AuthorityBase58",
      "txSignature": "TransactionSignatureBase58",
      "details": { "mint": "MintBase58Address", "to": "RecipientBase58", "amount": "1000000" }
    }
  ]
}
```

Source: `backend/src/routes/compliance.ts`

### GET /compliance/audit/events

Retrieve on-chain events from the EventPoller, with optional filtering by action type and date range.

**Authentication**: Required (`Authorization: Bearer <key>`).

**Query Parameters**:
- `action` (optional) — filter events whose log lines contain this string (e.g. `"mint"`, `"burn"`)
- `from` (optional) — ISO 8601 date string; only return events at or after this time
- `to` (optional) — ISO 8601 date string; only return events at or before this time

**Response** (200):
```json
{
  "total": 5,
  "events": [
    {
      "signature": "TransactionSignatureBase58",
      "blockTime": 1709650000,
      "logs": ["Program log: Instruction: Mint", "..."]
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

CORS is origin-allowlist-based. The allowed origins are controlled by the `CORS_ORIGINS` environment variable (comma-separated), defaulting to `http://localhost:3000`. Only requests from an allowed origin receive the `Access-Control-Allow-Origin` header; all others receive no CORS header.

```
Access-Control-Allow-Origin: <matched-origin>
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Vary: Origin
```

OPTIONS preflight requests return 204 immediately (no auth check).

## Authentication

Protected routes require an API key passed as a Bearer token:

```
Authorization: Bearer <API_KEY>
```

The `API_KEY` environment variable controls the required value. If `API_KEY` is not set, all requests are allowed (dev mode — a one-time warning is logged).

**Public routes** (no auth required): `GET /health`, `GET /status`, `GET /events`

**Protected routes** (auth required when `API_KEY` is set): `POST /mint`, `POST /burn`, `POST /compliance/screen`, `POST /compliance/blacklist/add`, `POST /compliance/blacklist/remove`, `GET /compliance/audit`, `GET /compliance/audit/actions`, `GET /compliance/audit/events`

Unauthenticated requests to protected routes return:
```json
{ "error": "Missing or invalid Authorization header" }
```
with status 401.

## Rate Limiting

All routes except `GET /health` are subject to per-IP rate limiting. Limits are configurable via `RATE_LIMIT_MAX` (default: 100 requests) and `RATE_LIMIT_WINDOW_MS` (default: 60 seconds).

Rate limit headers are included on every response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

When the limit is exceeded, the response is 429 with `Retry-After` header and body:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit of 100 requests per 60s exceeded",
  "retryAfter": 42
}
```

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
| 401 | Unauthorized (missing or invalid API key) |
| 403 | Forbidden (sanctions screening failed) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal server error (transaction failed, RPC error, config missing) |
| 503 | Service unavailable (sanctions screening service unreachable) |

## Running the Backend

```bash
cd backend
npm install
MINT_ADDRESS=<your-mint> npm start
```

Required: a deployed stablecoin with the authority keypair available at the configured path.

---

For the full CLI command reference, see [CLI.md](./CLI.md).
