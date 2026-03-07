import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getConnection } from "../helpers";

export const supplyCommand = new Command("supply")
  .description("Show total supply info")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .action(async (opts) => {
    const connection = getConnection(opts.rpcUrl);
    const mint = new PublicKey(opts.mint);
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);

    console.log("=== Supply ===");
    console.log(`Mint:          ${mint.toBase58()}`);
    console.log(`Decimals:      ${mintInfo.decimals}`);
    console.log(`Total Supply:  ${mintInfo.supply.toString()}`);
    console.log(`Is Initialized: ${mintInfo.isInitialized}`);
  });
