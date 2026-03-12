"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seizeCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.seizeCommand = new commander_1.Command("seize [address]")
    .description("Seize tokens from a blacklisted account")
    .requiredOption("--mint <address>", "Mint address")
    .option("--from <address>", "Source token account (blacklisted)")
    .option("--to <address>", "Destination token account (treasury)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    const fromAccount = address || opts.from;
    if (!fromAccount) {
        console.error("Error: source account is required (positional arg or --from)");
        process.exit(1);
    }
    if (!opts.to) {
        console.error("Error: destination account is required (--to)");
        process.exit(1);
    }
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const txSig = await stablecoin.compliance.seize(new web3_js_1.PublicKey(fromAccount), new web3_js_1.PublicKey(opts.to));
        console.log(`Seized tokens from ${fromAccount} to ${opts.to}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to seize tokens: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=seize.js.map