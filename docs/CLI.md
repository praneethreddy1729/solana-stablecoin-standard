# CLI Reference

The `sss-token` CLI provides 18 commands for managing stablecoins from the terminal.

## Installation

```bash
cd sdk/cli
yarn install
```

## Usage

```bash
npx ts-node src/index.ts <command> [options]
# or, if installed globally:
sss-token <command> [options]
```

## Global Options

All commands accept:

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc-url <url>` | Solana RPC endpoint | `http://127.0.0.1:8899` |
| `--keypair <path>` | Path to keypair JSON file | `~/.config/solana/id.json` |

---

## Commands

### `init` — Create a new stablecoin

Creates a Token-2022 mint with the selected SSS preset.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Token name (required unless `--custom`) | |
| `--symbol <symbol>` | Token symbol (required unless `--custom`) | |
| `--uri <uri>` | Metadata URI | `""` |
| `--decimals <n>` | Token decimals (0-18) | `6` |
| `--preset <preset>` | `SSS-1`, `SSS-2`, or `CUSTOM` | `SSS_1` |
| `--custom <path>` | Config file (JSON or TOML) overrides all other flags | |
| `--transfer-hook` | Enable transfer hook (CUSTOM preset only) | |
| `--permanent-delegate` | Enable permanent delegate (CUSTOM preset only) | |
| `--default-frozen` | New accounts start frozen (CUSTOM preset only) | |

**Examples:**

```bash
# SSS-1 basic stablecoin
sss-token init --name "TestUSD" --symbol "TUSD" --decimals 6 --preset SSS-1

# SSS-2 compliance stablecoin
sss-token init --name "RegUSD" --symbol "rUSD" --decimals 6 --preset SSS-2

# Custom preset with individual flags
sss-token init --name "MyUSD" --symbol "MUSD" --preset CUSTOM --transfer-hook --permanent-delegate

# From a config file
sss-token init --custom ./token-config.json
```

**Output:**
```
Creating stablecoin: TestUSD (TUSD)
Preset: 0
Mint: <MINT_ADDRESS>
Config PDA: <CONFIG_PDA>
Tx: <TX_SIGNATURE>
```

---

### `mint` — Mint tokens

Mints tokens to a recipient token account. Requires Minter role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--to <address>` | Recipient token account (or positional arg) |
| `--amount <amount>` | Amount in raw base units (or positional arg) |
| `--minter <address>` | Minter pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token mint --mint <MINT> --to <TOKEN_ACCOUNT> --amount 1000000
# or positional args:
sss-token mint <TOKEN_ACCOUNT> <AMOUNT> --mint <MINT>
```

---

### `burn` — Burn tokens

Burns tokens from a token account. Requires Burner role and token account owner co-sign.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--from <address>` | Source token account (required) |
| `--amount <amount>` | Amount in raw base units (or positional arg) |
| `--from-authority <address>` | Token account authority (defaults to wallet) |
| `--burner <address>` | Burner pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token burn --mint <MINT> --from <TOKEN_ACCOUNT> --amount 500000
```

---

### `freeze` — Freeze a token account

Freezes a token account. Requires Freezer role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--account <address>` | Token account to freeze (or positional arg) |
| `--freezer <address>` | Freezer pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token freeze --mint <MINT> --account <TOKEN_ACCOUNT>
sss-token freeze <TOKEN_ACCOUNT> --mint <MINT>
```

---

### `thaw` — Thaw a frozen token account

Thaws a frozen token account. Requires Freezer role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--account <address>` | Token account to thaw (or positional arg) |
| `--freezer <address>` | Freezer pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token thaw --mint <MINT> --account <TOKEN_ACCOUNT>
```

---

### `pause` — Pause all operations

Sets the global pause flag, blocking mint, burn, and transfers. Requires Pauser role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--pauser <address>` | Pauser pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token pause --mint <MINT>
```

---

### `unpause` — Resume operations

Clears the global pause flag (both manual pause and attestation-triggered pause). Requires Pauser role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--pauser <address>` | Pauser pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token unpause --mint <MINT>
```

---

### `blacklist add` — Add address to blacklist

Blacklists a wallet address via CPI to the transfer hook program. SSS-2 only. Requires Blacklister role.

**Arguments:**
- `<address>` — Wallet address to blacklist

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--reason <reason>` | Reason string, max 64 bytes (e.g. `"OFAC SDN"`) |
| `--blacklister <address>` | Blacklister pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token blacklist add <WALLET> --mint <MINT> --reason "OFAC SDN List"
```

---

### `blacklist remove` — Remove address from blacklist

Removes a wallet from the blacklist. SSS-2 only. Requires Blacklister role.

**Arguments:**
- `<address>` — Wallet address to unblacklist

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--blacklister <address>` | Blacklister pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token blacklist remove <WALLET> --mint <MINT>
```

---

### `blacklist check` — Check blacklist status

Checks whether an address is currently blacklisted. Read-only, no keypair needed.

**Arguments:**
- `<address>` — Wallet address to check

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token blacklist check <WALLET> --mint <MINT>
```

---

### `seize` — Seize tokens from a blacklisted account

Transfers all tokens from a blacklisted token account to the treasury using the permanent delegate. SSS-2 only. Requires Seizer role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--from <address>` | Source token account (blacklisted) (or positional arg) |
| `--to <address>` | Destination treasury token account (required) |

**Examples:**

```bash
sss-token seize --mint <MINT> --from <BLACKLISTED_ACCOUNT> --to <TREASURY_ACCOUNT>
```

---

### `status` — Show stablecoin configuration

Displays the full StablecoinConfig state and current mint supply.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--mint <address>` | Mint address (required) | |
| `--format <format>` | Output format: `text` or `json` | `text` |

**Examples:**

```bash
sss-token status --mint <MINT>
sss-token status --mint <MINT> --format json
```

**Output (text):**
```
=== Stablecoin Status ===
Mint:                   <ADDRESS>
Authority:              <ADDRESS>
Pending Authority:      <ADDRESS>
Decimals:               6
Paused:                 false
Transfer Hook:          true
Permanent Delegate:     true
Default Frozen:         false
Hook Program:           <ADDRESS>
Supply:                 1000000
Freeze Authority:       <ADDRESS>
Mint Authority:         <ADDRESS>
```

---

### `supply` — Show token supply

Displays the current circulating supply of the token.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token supply --mint <MINT>
```

---

### `minters` — List minters and quotas

Lists all active minters and their cumulative quota / minted-so-far amounts.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token minters --mint <MINT>
```

---

### `holders` — List token holders

Lists all token accounts holding a non-zero balance for the mint.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token holders --mint <MINT>
```

---

### `transfer-authority` — Initiate authority transfer

Proposes transferring authority to a new address (step 1 of 2). Requires current authority.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--new-authority <address>` | Proposed new authority pubkey (required) |

**Examples:**

```bash
sss-token transfer-authority --mint <MINT> --new-authority <NEW_AUTHORITY>
```

---

### `accept-authority` — Accept authority transfer

Accepts a pending authority transfer (step 2 of 2). Must be signed by the pending authority.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token accept-authority --mint <MINT> --keypair <NEW_AUTHORITY_KEYPAIR>
```

---

### `cancel-authority-transfer` — Cancel authority transfer

Cancels a pending authority transfer. Requires current authority.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token cancel-authority-transfer --mint <MINT>
```

---

### `attest-reserves` — Submit reserve attestation

Submits a proof-of-reserves attestation. Auto-pauses if `reserve_amount < token_supply`. Requires Attestor role.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--reserve-amount <amount>` | Reserve amount in base units (required) |
| `--expires-in <seconds>` | Attestation validity window in seconds (required) |
| `--uri <uri>` | Attestation proof URI, max 256 bytes (required) |
| `--attestor <address>` | Attestor pubkey (defaults to wallet) |

**Examples:**

```bash
sss-token attest-reserves \
  --mint <MINT> \
  --reserve-amount 1000000000 \
  --expires-in 86400 \
  --uri "https://attestation.example.com/proof-2026-03-11.json"
```

---

### `update-treasury` — Set treasury account

Updates the treasury token account used as the destination for seized funds. Requires authority.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |
| `--new-treasury <address>` | New treasury token account pubkey (required) |

**Examples:**

```bash
sss-token update-treasury --mint <MINT> --new-treasury <TREASURY_TOKEN_ACCOUNT>
```

---

### `audit-log` — View on-chain event history

Fetches and displays all SSS program events emitted by the mint's transactions.

**Options:**

| Option | Description |
|--------|-------------|
| `--mint <address>` | Mint address (required) |

**Examples:**

```bash
sss-token audit-log --mint <MINT>
```

---

## Full SSS-2 Lifecycle Example

```bash
MINT=<YOUR_MINT>
KEYPAIR=~/.config/solana/id.json
RPC=https://api.devnet.solana.com

# Create a regulated stablecoin
sss-token init --name "RegUSD" --symbol "rUSD" --decimals 6 --preset SSS-2 \
  --keypair $KEYPAIR --rpc-url $RPC

# Mint tokens (after assigning Minter role via SDK)
sss-token mint --mint $MINT --to <TOKEN_ACCOUNT> --amount 10000000 \
  --keypair $KEYPAIR --rpc-url $RPC

# Blacklist a sanctioned address
sss-token blacklist add <WALLET> --mint $MINT --reason "OFAC SDN" \
  --keypair $KEYPAIR --rpc-url $RPC

# Seize tokens from the blacklisted account
sss-token seize --mint $MINT --from <BLACKLISTED_TOKEN_ACCOUNT> --to <TREASURY_ACCOUNT> \
  --keypair $KEYPAIR --rpc-url $RPC

# Check status
sss-token status --mint $MINT --rpc-url $RPC

# Submit a proof-of-reserves attestation
sss-token attest-reserves --mint $MINT \
  --reserve-amount 10000000 --expires-in 86400 \
  --uri "https://example.com/reserves.json" \
  --keypair $KEYPAIR --rpc-url $RPC
```
