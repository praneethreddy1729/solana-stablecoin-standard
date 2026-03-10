import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getConnection } from "../helpers";

export const supplyCommand = new Command("supply")
  .description("Show total supply info")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (opts) => {
    const connection = getConnection(opts.rpcUrl);
    const mint = new PublicKey(opts.mint);
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);

    if (opts.format === "json") {
      console.log(JSON.stringify({
        mint: mint.toBase58(),
        decimals: mintInfo.decimals,
        totalSupply: mintInfo.supply.toString(),
        isInitialized: mintInfo.isInitialized,
      }, null, 2));
    } else {
      console.log("=== Supply ===");
      console.log(`Mint:          ${mint.toBase58()}`);
      console.log(`Decimals:      ${mintInfo.decimals}`);
      console.log(`Total Supply:  ${mintInfo.supply.toString()}`);
      console.log(`Is Initialized: ${mintInfo.isInitialized}`);
    }
  });
