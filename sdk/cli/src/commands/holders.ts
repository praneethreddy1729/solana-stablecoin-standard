import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "../../../core/src";
import { getConnection } from "../helpers";

export const holdersCommand = new Command("holders")
  .description("List token holders via getProgramAccounts")
  .requiredOption("--mint <address>", "Mint address")
  .option("--min-balance <n>", "Minimum balance filter (raw token units)")
  .option("--rpc-url <url>", "RPC URL")
  .action(async (opts) => {
    const connection = getConnection(opts.rpcUrl);
    const mint = new PublicKey(opts.mint);

    // Token-2022 accounts have variable size due to extensions, so we cannot
    // use a dataSize filter. Instead, filter only by mint memcmp.
    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          { memcmp: { offset: 0, bytes: mint.toBase58() } },
        ],
      }
    );

    const minBalance = opts.minBalance ? BigInt(opts.minBalance) : BigInt(0);

    const filtered = accounts.filter(({ account }) => {
      const parsed = (account.data as any)?.parsed?.info;
      if (!parsed) return false;
      const amount = BigInt(parsed.tokenAmount?.amount ?? "0");
      return amount >= minBalance;
    });

    if (filtered.length === 0) {
      console.log("No token holders found matching criteria.");
      return;
    }

    console.log(`=== Token Holders (${filtered.length}) ===`);
    for (const { pubkey, account } of filtered) {
      const parsed = (account.data as any)?.parsed?.info;
      if (!parsed) continue;
      const owner = parsed.owner ?? "unknown";
      const amount = parsed.tokenAmount?.amount ?? "0";
      const stateStr = parsed.state ?? "unknown";

      console.log(`  Account: ${pubkey.toBase58()}`);
      console.log(`    Owner:  ${owner}`);
      console.log(`    Amount: ${amount}`);
      console.log(`    State:  ${stateStr}`);
    }
  });
