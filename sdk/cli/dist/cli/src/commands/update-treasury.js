"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTreasuryCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.updateTreasuryCommand = new commander_1.Command("update-treasury")
    .description("Update the treasury token account")
    .requiredOption("--mint <address>", "Mint address")
    .requiredOption("--new-treasury <address>", "New treasury token account pubkey")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const newTreasury = new web3_js_1.PublicKey(opts.newTreasury);
        const txSig = await stablecoin.updateTreasury(newTreasury);
        console.log(`Treasury updated to ${opts.newTreasury}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to update treasury: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=update-treasury.js.map