import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { findConfigPda, SSS_TOKEN_PROGRAM_ID } from "../../../core/src";
import { getConnection } from "../helpers";

export const auditLogCommand = new Command("audit-log")
  .description("Query indexed events (transaction signatures)")
  .requiredOption("--mint <address>", "Mint address (used as config PDA lookup)")
  .option("--limit <n>", "Number of recent signatures to fetch", "20")
  .option("--action <type>", "Filter by action type in memo (e.g. 'mint', 'burn', 'blacklist')")
  .option("--rpc-url <url>", "RPC URL")
  .action(async (opts) => {
    const connection = getConnection(opts.rpcUrl);
    const limit = parseInt(opts.limit, 10);

    // Derive the config PDA from the mint and query its signatures
    const mintPubkey = new PublicKey(opts.mint);
    const [configPda] = findConfigPda(mintPubkey, SSS_TOKEN_PROGRAM_ID);
    const signatures = await connection.getSignaturesForAddress(
      configPda,
      { limit }
    );

    const filtered = opts.action
      ? signatures.filter((sig) => sig.memo?.toLowerCase().includes(opts.action.toLowerCase()))
      : signatures;

    if (filtered.length === 0) {
      console.log("No transactions found.");
      return;
    }

    console.log(`=== Recent Transactions (${filtered.length}) ===`);
    for (const sig of filtered) {
      const time = sig.blockTime
        ? new Date(sig.blockTime * 1000).toISOString()
        : "unknown";
      const status = sig.err ? "FAILED" : "OK";
      console.log(`  ${time} | ${status} | ${sig.signature}`);
      if (sig.memo) {
        console.log(`    Memo: ${sig.memo}`);
      }
    }
  });
