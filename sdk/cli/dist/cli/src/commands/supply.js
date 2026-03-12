"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplyCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const helpers_1 = require("../helpers");
exports.supplyCommand = new commander_1.Command("supply")
    .description("Show total supply info")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (opts) => {
    try {
        const connection = (0, helpers_1.getConnection)(opts.rpcUrl);
        const mint = new web3_js_1.PublicKey(opts.mint);
        const mintInfo = await (0, spl_token_1.getMint)(connection, mint, "confirmed", spl_token_1.TOKEN_2022_PROGRAM_ID);
        if (opts.format === "json") {
            console.log(JSON.stringify({
                mint: mint.toBase58(),
                decimals: mintInfo.decimals,
                totalSupply: mintInfo.supply.toString(),
                isInitialized: mintInfo.isInitialized,
            }, null, 2));
        }
        else {
            console.log("=== Supply ===");
            console.log(`Mint:          ${mint.toBase58()}`);
            console.log(`Decimals:      ${mintInfo.decimals}`);
            console.log(`Total Supply:  ${mintInfo.supply.toString()}`);
            console.log(`Is Initialized: ${mintInfo.isInitialized}`);
        }
    }
    catch (err) {
        console.error(`Failed to fetch supply: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=supply.js.map