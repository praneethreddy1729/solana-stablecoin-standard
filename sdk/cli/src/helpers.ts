import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { SolanaStablecoin } from "../../core/src";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Parse a human-readable or raw amount string into base units.
 * - If the input contains '.', treat as human-readable (e.g. "1.5" with 6 decimals → 1500000)
 * - Otherwise treat as raw base units (e.g. "1500000" → 1500000)
 */
export function parseAmount(input: string, decimals: number): BN {
  if (input.includes(".")) {
    const [whole, frac = ""] = input.split(".");
    if (frac.length > decimals) {
      throw new Error(
        `Too many decimal places: ${frac.length} (max ${decimals} for this token)`
      );
    }
    const paddedFrac = frac.padEnd(decimals, "0");
    return new BN(whole + paddedFrac);
  }
  return new BN(input);
}

export function loadKeypair(keypairPath?: string): Keypair {
  const resolved =
    keypairPath ||
    process.env.ANCHOR_WALLET ||
    path.join(os.homedir(), ".config", "solana", "id.json");
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to load keypair from ${resolved}: ${msg}`);
    process.exit(1);
  }
}

export function loadWallet(keypairPath?: string): Wallet {
  return new Wallet(loadKeypair(keypairPath));
}

export function getConnection(rpcUrl?: string): Connection {
  const url =
    rpcUrl ||
    process.env.ANCHOR_PROVIDER_URL ||
    "http://localhost:8899";
  return new Connection(url, "confirmed");
}

export async function loadStablecoin(
  mintAddress: string,
  opts: { rpcUrl?: string; keypair?: string }
): Promise<SolanaStablecoin> {
  const connection = getConnection(opts.rpcUrl);
  const wallet = loadWallet(opts.keypair);
  const mint = new PublicKey(mintAddress);
  return SolanaStablecoin.load(connection, wallet, mint);
}
