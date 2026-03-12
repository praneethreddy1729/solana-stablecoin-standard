import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { loadStablecoin } from "../helpers";

export const statusCommand = new Command("status")
  .description("Show stablecoin config, supply, and pause state")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (opts) => {
    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const config = await stablecoin.getConfig();
      const mintInfo = await getMint(
        stablecoin.connection,
        new PublicKey(opts.mint),
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      if (opts.format === "json") {
        console.log(JSON.stringify({
          mint: config.mint.toBase58(),
          authority: config.authority.toBase58(),
          pendingAuthority: config.pendingAuthority.toBase58(),
          decimals: config.decimals,
          paused: config.paused,
          transferHook: config.enableTransferHook,
          permanentDelegate: config.enablePermanentDelegate,
          defaultFrozen: config.defaultAccountFrozen,
          hookProgram: config.hookProgramId.toBase58(),
          supply: mintInfo.supply.toString(),
          freezeAuthority: mintInfo.freezeAuthority?.toBase58() ?? null,
          mintAuthority: mintInfo.mintAuthority?.toBase58() ?? null,
        }, null, 2));
      } else {
        console.log("=== Stablecoin Status ===");
        console.log(`Mint:                   ${config.mint.toBase58()}`);
        console.log(`Authority:              ${config.authority.toBase58()}`);
        console.log(`Pending Authority:      ${config.pendingAuthority.toBase58()}`);
        console.log(`Decimals:               ${config.decimals}`);
        console.log(`Paused:                 ${config.paused}`);
        console.log(`Transfer Hook:          ${config.enableTransferHook}`);
        console.log(`Permanent Delegate:     ${config.enablePermanentDelegate}`);
        console.log(`Default Frozen:         ${config.defaultAccountFrozen}`);
        console.log(`Hook Program:           ${config.hookProgramId.toBase58()}`);
        console.log(`Supply:                 ${mintInfo.supply.toString()}`);
        console.log(`Freeze Authority:       ${mintInfo.freezeAuthority?.toBase58() ?? "none"}`);
        console.log(`Mint Authority:         ${mintInfo.mintAuthority?.toBase58() ?? "none"}`);
      }
    } catch (err: unknown) {
      console.error(`Failed to fetch status: ${(err as Error).message}`);
      process.exit(1);
    }
  });
