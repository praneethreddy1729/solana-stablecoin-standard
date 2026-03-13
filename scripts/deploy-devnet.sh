#!/bin/bash
# Deploy SSS programs to Solana Devnet
# Usage: ./scripts/deploy-devnet.sh
# Prerequisites: ~5 SOL in devnet wallet

set -e

PROGRAM_DIR="target/deploy"
SSS_TOKEN_SO="$PROGRAM_DIR/sss_token.so"
SSS_HOOK_SO="$PROGRAM_DIR/sss_transfer_hook.so"
SSS_TOKEN_KEYPAIR="$PROGRAM_DIR/sss_token-keypair.json"
SSS_HOOK_KEYPAIR="$PROGRAM_DIR/sss_transfer_hook-keypair.json"

RPC_URL="https://api.devnet.solana.com"

echo "=== SSS Devnet Deployment ==="

# Check wallet balance
BALANCE=$(solana balance --url "$RPC_URL" | awk '{print $1}')
echo "Wallet balance: $BALANCE SOL"
if (( $(echo "$BALANCE < 3" | bc -l) )); then
    echo "ERROR: Need at least 3 SOL for deployment. Current: $BALANCE SOL"
    echo "Run: solana airdrop 5 --url devnet"
    exit 1
fi

# Check .so files exist
if [ ! -f "$SSS_TOKEN_SO" ] || [ ! -f "$SSS_HOOK_SO" ]; then
    echo "ERROR: Build artifacts not found. Run: anchor build"
    exit 1
fi

echo ""
echo "--- Deploying sss-transfer-hook (deploy hook first) ---"
solana program deploy "$SSS_HOOK_SO" \
    --url "$RPC_URL" \
    --program-id "$SSS_HOOK_KEYPAIR" \
    --with-compute-unit-price 1
echo "Hook deployed!"

echo ""
echo "--- Deploying sss-token ---"
solana program deploy "$SSS_TOKEN_SO" \
    --url "$RPC_URL" \
    --program-id "$SSS_TOKEN_KEYPAIR" \
    --with-compute-unit-price 1
echo "Token program deployed!"

echo ""
echo "=== Deployment Complete ==="
echo "sss-token program ID:         $(solana-keygen pubkey $SSS_TOKEN_KEYPAIR)"
echo "sss-transfer-hook program ID: $(solana-keygen pubkey $SSS_HOOK_KEYPAIR)"
echo ""
echo "Verify on Solana Explorer:"
echo "  https://explorer.solana.com/address/$(solana-keygen pubkey $SSS_TOKEN_KEYPAIR)?cluster=devnet"
echo "  https://explorer.solana.com/address/$(solana-keygen pubkey $SSS_HOOK_KEYPAIR)?cluster=devnet"
