# Solana Stablecoin Standard (SSS)

## Build Commands
```bash
# Build both programs (need rustup cargo for +toolchain, plus CC for linker)
PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/local/bin:$PATH" CC=/usr/bin/cc anchor build
# If anchor build only builds one program, explicitly build the other:
PATH="..." CC=/usr/bin/cc anchor build -p sss-token
PATH="..." CC=/usr/bin/cc anchor build -p sss_transfer_hook

# Generate IDL (outputs JSON to stdout, save it)
anchor idl build -p sss_token 2>/dev/null > target/idl/sss_token.json
anchor idl build -p sss_transfer_hook 2>/dev/null > target/idl/sss_transfer_hook.json
# Note: IDL output goes to stdout mixed with compile output; extract JSON from line starting with {

# Generate TypeScript types from IDL
anchor idl type target/idl/sss_token.json -o target/types/sss_token.ts
anchor idl type target/idl/sss_transfer_hook.json -o target/types/sss_transfer_hook.ts

# Run tests manually (anchor test has env issues)
pkill -f solana-test-validator; sleep 2
solana-test-validator --deactivate-feature CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM --reset --bind-address 127.0.0.1 --bpf-program tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz target/deploy/sss_token.so --bpf-program A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB target/deploy/sss_transfer_hook.so &
sleep 5
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

## Instruction Names (Post-Rename)
- On-chain: `mint`, `burn`, `update_minter` (not mint_tokens/burn_tokens/update_minter_quota)
- IDL/TS: `.mint()`, `.burn()`, `.updateMinter()`
- SDK class: `.mint(to, amount, minter)`, `.burn(from, amount, burner, fromAuthority?)`
- SDK package: `@stbr/sss-token` (not @sss/sdk)

## Architecture
- **sss-token**: Main stablecoin program (17 instructions)
  - Program ID: tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
- **sss-transfer-hook**: Transfer hook + blacklist PDAs
  - Program ID: A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB

## Role Types (7 total)
- Minter(0), Burner(1), Pauser(2), Freezer(3), Blacklister(4), Seizer(5), Attestor(6)

## Key Decisions
- BlacklistEntry PDAs owned by hook program (not main program)
- Config PDA is both mint authority and freeze authority
- Transfer hook checks BOTH sender and receiver via AccountData extraction
- Permanent delegate bypass in hook execute for seize operations
- SSS-2 instructions fail gracefully on SSS-1 tokens
- Seize requires Seizer role (not authority-only)
- BlacklistEntry stores reason string (max 64 bytes)
- Hook add/remove_from_blacklist validates config PDA derivation + program ownership

## Token-2022 Extension Init Order
1. createAccount → 2. PermanentDelegate → 3. TransferHook → 4. DefaultAccountState → 5. MetadataPointer → 6. initializeMint → 7. TokenMetadata

## PDA Seeds
- Config: [b"config", mint]
- Role: [b"role", config, role_type, assignee]
- BlacklistEntry: [b"blacklist", mint, user] (hook program)
- ExtraAccountMetas: [b"extra-account-metas", mint] (hook program)
- ReserveAttestation: [b"attestation", config] (main program)

## Cargo Dependency Notes
- blake3 pinned to 1.5.5 (1.8+ requires edition2024, incompatible with platform-tools cargo 1.84)
- Use `anchor-spl` feature `token_2022` (underscore, not hyphen)

## Error Codes
- 6000-6023: Original errors (see errors.rs)
- 6024: ReasonTooLong (blacklist reason > 64 bytes)
- 6030: AttestationUriTooLong (> 256 bytes)
- 6031: InvalidExpiration (must be positive)
- 6032: Undercollateralized (reserves < supply, auto-pauses)
- 6033: CannotFreezeTreasury (cannot freeze the treasury account)

## Security Design
- Blacklister CPI: sss-token uses `invoke_signed` with config PDA signer seeds; hook checks `config.is_signer` (any Blacklister role holder can blacklist)
- Auto-pause separation: `paused` (manual) vs `paused_by_attestation` (undercollateralized); `require_not_paused` checks BOTH; `unpause` clears BOTH
- Treasury freeze protection: `freeze_account` rejects if target is the treasury ATA
- Config struct: includes `paused_by_attestation: bool` field, `_reserved: [u8; 31]`

## Known Issues
- Agave 3.0.x SIMD-0219 breaks Token-2022 metadata realloc (anza-xyz/agave#9799)
  - Fix: Anchor.toml deactivates feature `CxeBn9PVeeXbmjbNwLv6U4C6svNxnC4JX6mfkvgeMocM`
  - cargo-build-sbf must be symlinked into `~/.cargo/bin/` for anchor to find it
- Initialize creates mint with extension-only space + lamports for full size; Token-2022 auto-reallocs during metadata init
