# Operations Guide

## Deployment

### Prerequisites

- Solana CLI with Agave 3.0.x installed (via `solana-install`)
- Anchor CLI 0.32.1 (specified in `Anchor.toml [toolchain]`)
- `cargo-build-sbf` symlinked into `~/.cargo/bin/`
- Node.js 18+ and Yarn

### Step 1: Build Programs

```bash
PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH" CC=/usr/bin/cc anchor build
```

This produces:
- `target/deploy/sss_token.so`
- `target/deploy/sss_transfer_hook.so`
- `target/idl/sss_token.json` and `target/idl/sss_transfer_hook.json`
- `target/types/sss_token.ts` and `target/types/sss_transfer_hook.ts`

### Step 2: Deploy Programs

Deploy to devnet first:

```bash
solana config set --url devnet
solana program deploy target/deploy/sss_token.so --program-id target/deploy/sss_token-keypair.json
solana program deploy target/deploy/sss_transfer_hook.so --program-id target/deploy/sss_transfer_hook-keypair.json
```

Program IDs (from `Anchor.toml`):
- sss-token: `8PRbAdtmGWZRjQJpsybTgojq5UkYsCSujTERY3QhC9LW`
- sss-transfer-hook: `J9eLtU1WpAThPvysxzLKkYhoBZaMQJPwjNStTKSokJcf`

### Step 3: Initialize a Stablecoin

**SSS-1 (basic)** using the SDK:
```typescript
const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,
  {
    name: "USD Stablecoin",
    symbol: "USDS",
    uri: "https://your-domain.com/metadata.json",
    decimals: 6,
    preset: Preset.SSS_1,
    authority: keypair,
  }
);
```

**SSS-2 (compliance)** using the SDK:
```typescript
const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
  connection,
  {
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://your-domain.com/metadata.json",
    decimals: 6,
    preset: Preset.SSS_2,
    authority: keypair,
  }
);
```

Or using direct Anchor calls:

```typescript
await program.methods
  .initialize({
    name: "Regulated USD",
    symbol: "rUSD",
    uri: "https://your-domain.com/metadata.json",
    decimals: 6,
    enableTransferHook: true,
    enablePermanentDelegate: true,
    defaultAccountFrozen: true,
  })
  .accountsStrict({
    authority: authority.publicKey,
    config: configPda,
    mint: mintKeypair.publicKey,
    hookProgram: hookProgramId,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .signers([mintKeypair])
  .rpc();
```

### Step 4: Initialize Transfer Hook (SSS-2 only)

After initializing an SSS-2 token, set up the ExtraAccountMetas on the hook program:

```typescript
await hookProgram.methods
  .initializeExtraAccountMetas()
  .accountsStrict({
    authority: authority.publicKey,
    mint: mintKeypair.publicKey,
    extraAccountMetas: extraAccountMetasPda,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Role Assignment

### Assigning Roles

Only the authority can assign roles. Each role is a separate PDA.

Using the SDK:
```typescript
await stablecoin.updateRoles({
  roleType: RoleType.Minter,
  assignee: minterPubkey,
  isActive: true,
});
```

Using direct Anchor:
```typescript
const [minterRole] = findRolePda(configPda, RoleType.Minter, minterPubkey);

await program.methods
  .updateRoles(0, minterPubkey, true)
  .accountsStrict({
    authority: authority.publicKey,
    config: configPda,
    role: minterRole,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Role Type Reference

| Role | Value | Typical Assignee |
|------|-------|-----------------|
| Minter | 0 | Treasury operations team |
| Burner | 1 | Redemption operations team |
| Pauser | 2 | Risk/security team |
| Freezer | 3 | Compliance team |
| Blacklister | 4 | Compliance team (SSS-2 only) |

### Deactivating Roles

Set `is_active = false` to deactivate without closing the account:

```typescript
await stablecoin.updateRoles({
  roleType: RoleType.Minter,
  assignee: minterPubkey,
  isActive: false,
});
```

The role PDA persists with its minting history, allowing reactivation later.

### Multiple Role Holders

Multiple wallets can hold the same role type. Each gets its own PDA:

```typescript
await stablecoin.updateRoles({ roleType: RoleType.Minter, assignee: alicePubkey, isActive: true });
await stablecoin.updateRoles({ roleType: RoleType.Minter, assignee: bobPubkey, isActive: true });
```

## Minting Workflow

### Setting Minter Quotas

Every minter has a cumulative quota that must be set before minting:

```typescript
await stablecoin.updateMinterQuota({
  minterRole: minterRolePda,
  newQuota: new BN(10_000_000_000), // 10,000 USDC (6 decimals)
});
```

### Quota Tracking

- `minter_quota`: Maximum cumulative amount this minter can ever mint
- `minted_amount`: Running total of all tokens minted (tracked via `checked_add`)
- Mint fails if `minted_amount + amount > minter_quota` (MinterQuotaExceeded)

To increase a minter's capacity, update the quota to a higher value. The `minted_amount` is never reset -- it tracks lifetime minting.

### Minting Tokens

```typescript
await stablecoin.mint(
  recipientAta,
  new BN(1_000_000),
  minterPubkey,
);
```

If `default_account_frozen` is enabled, the instruction automatically thaws the recipient's account before minting.

## Pause/Freeze Procedures

### Emergency Pause

```typescript
await stablecoin.pause({ pauser: pauserPubkey });
```

**Scope of pause**:
- SSS-1: Blocks `mint` and `burn`
- SSS-2: Also blocks all transfers (via transfer hook pause check at config byte offset 145)

### Resume Operations

```typescript
await stablecoin.unpause({ pauser: pauserPubkey });
```

### Freezing Individual Accounts

```typescript
// Freeze
await stablecoin.freeze({ tokenAccount: targetAta, freezer: freezerPubkey });

// Thaw
await stablecoin.thaw({ tokenAccount: targetAta, freezer: freezerPubkey });
```

## Authority Transfer

### Standard Transfer Flow

Two-step process to prevent accidental authority loss:

```typescript
// Step 1: Current authority initiates transfer
await stablecoin.transferAuthority(newAuthorityPubkey);

// Step 2: New authority accepts (must be called by newAuthority's wallet)
await stablecoin.acceptAuthority();
```

### Canceling a Transfer

```typescript
await stablecoin.cancelAuthorityTransfer();
```

### Recommendations

- Use a multi-sig wallet as the authority for production deployments
- Test authority transfer on devnet before mainnet
- The `transfer_initiated_at` timestamp is recorded on-chain for audit purposes

## Backend Operations

### Starting the Backend

```bash
cd backend
npm install
MINT_ADDRESS=<mint-address> SOLANA_RPC_URL=<rpc-url> npm start
```

The backend:
- Loads authority from `AUTHORITY_KEYPAIR` (default: `~/.config/solana/id.json`)
- Requires `MINT_ADDRESS` environment variable
- Listens on port 3001 (configurable via `PORT`)
- Polls for events every 5 seconds via `EventPoller`

### Backend Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | RPC connectivity and mint status |
| GET | /status | Mint info and parsed config data |
| POST | /mint | Mint tokens to a recipient |
| POST | /burn | Burn tokens from an account |
| POST | /compliance/screen | Screen address against sanctions |
| GET | /compliance/audit | Retrieve screening audit log |
| GET | /events | Retrieve polled events |

See [API Reference](./API.md) for full request/response documentation.

### Sanctions Screening

Enable with `ENABLE_SANCTIONS_SCREENING=true`. Configure external API with `SANCTIONS_API_URL`. Falls back to mock screening if the API is unavailable.

## Monitoring

### Event Indexing

All instructions emit Anchor events. The backend's `EventPoller` polls for config changes. For production monitoring, subscribe to program logs:

```typescript
connection.onLogs(program.programId, (logs) => {
  // Parse Anchor events from logs
});
```

### Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Total supply | Mint account | Unexpected changes |
| Minter quota utilization | RoleAssignment accounts | >90% of quota |
| Pause state | StablecoinConfig.paused | Any pause event |
| Blacklist additions | AddressBlacklisted events | Any addition |
| Authority changes | AuthorityTransferAccepted events | Any change |
| Failed transactions | Transaction logs | Spike in errors |
