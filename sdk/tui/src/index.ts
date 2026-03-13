#!/usr/bin/env node
/**
 * SSS Admin TUI — Entry Point
 *
 * Interactive terminal interface for monitoring and operating
 * Solana Stablecoin Standard (SSS) tokens.
 *
 * Usage:
 *   sss-tui --mint <MINT_ADDRESS> [--rpc <RPC_URL>] [--keypair <PATH>]
 *
 * Examples:
 *   sss-tui --mint tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz
 *   sss-tui --mint <MINT> --rpc https://api.devnet.solana.com
 *   sss-tui --mint <MINT> --keypair ~/.config/solana/id.json
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { launchDashboard } from "./dashboard";

// ─── Argument parsing (minimal, no external deps) ───────────────
interface Args {
  mint: string;
  rpc: string;
  keypair: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = {
    mint: "",
    rpc:
      process.env.ANCHOR_PROVIDER_URL ||
      process.env.SOLANA_RPC_URL ||
      "http://localhost:8899",
    keypair:
      process.env.ANCHOR_WALLET ||
      path.join(os.homedir(), ".config", "solana", "id.json"),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--mint" || arg === "-m") && next) {
      parsed.mint = next;
      i++;
    } else if ((arg === "--rpc" || arg === "--rpc-url" || arg === "-r") && next) {
      parsed.rpc = next;
      i++;
    } else if ((arg === "--keypair" || arg === "-k") && next) {
      parsed.keypair = next;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("sss-tui v0.1.0");
      process.exit(0);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│            SSS Admin TUI — Stablecoin Dashboard             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USAGE                                                      │
│    sss-tui --mint <MINT_ADDRESS> [options]                  │
│                                                             │
│  OPTIONS                                                    │
│    --mint, -m     Stablecoin mint address (required)        │
│    --rpc, -r      Solana RPC URL (default: localhost:8899)  │
│    --keypair, -k  Path to keypair file                      │
│    --help, -h     Show this help                            │
│    --version, -v  Show version                              │
│                                                             │
│  KEYBOARD SHORTCUTS (in dashboard)                          │
│    M   Mint tokens         B   Burn tokens                  │
│    P   Pause / Unpause     F   Freeze account               │
│    T   Thaw account        R   Force refresh                │
│    Q   Quit                                                 │
│                                                             │
│  EXAMPLES                                                   │
│    sss-tui --mint <ADDR> --rpc https://api.devnet.solana.com│
│    sss-tui -m <ADDR> -k ~/.config/solana/devnet.json        │
│                                                             │
│  The TUI polls the chain every 5 seconds for live updates.  │
│                                                             │
│  Environment variables:                                     │
│    ANCHOR_PROVIDER_URL — default RPC URL                    │
│    ANCHOR_WALLET       — default keypair path               │
│    SOLANA_RPC_URL      — alternate RPC URL env var          │
└─────────────────────────────────────────────────────────────┘
`);
}

function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.replace(/^~/, os.homedir());
  if (!fs.existsSync(resolved)) {
    console.error(`Keypair file not found: ${resolved}`);
    console.error(
      "Create one with: solana-keygen new --outfile ~/.config/solana/id.json"
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.mint) {
    console.error("Error: --mint <MINT_ADDRESS> is required\n");
    printHelp();
    process.exit(1);
  }

  // Validate mint address
  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(args.mint);
  } catch {
    console.error(`Invalid mint address: ${args.mint}`);
    process.exit(1);
  }

  // Load keypair
  const keypair = loadKeypair(args.keypair);
  const wallet = new Wallet(keypair);

  // Create connection
  const connection = new Connection(args.rpc, "confirmed");

  console.log(`\x1b[36m━━━ SSS Admin TUI ━━━\x1b[0m`);
  console.log(`Mint:     ${mintPubkey.toBase58()}`);
  console.log(`RPC:      ${args.rpc}`);
  console.log(`Wallet:   ${wallet.publicKey.toBase58()}`);
  console.log(`Connecting...`);

  // Verify connection
  try {
    await connection.getLatestBlockhash();
  } catch (err: any) {
    console.error(`Failed to connect to RPC: ${args.rpc}`);
    console.error(err.message || err);
    process.exit(1);
  }

  // Launch the dashboard
  await launchDashboard(connection, wallet, mintPubkey, args.rpc);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
