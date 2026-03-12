import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin } from "../../core/src";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
