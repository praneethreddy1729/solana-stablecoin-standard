"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferAuthorityCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.transferAuthorityCommand = new commander_1.Command("transfer-authority")
    .description("Initiate authority transfer to a new address")
    .requiredOption("--mint <address>", "Mint address")
    .requiredOption("--new-authority <address>", "New authority pubkey")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const newAuthority = new web3_js_1.PublicKey(opts.newAuthority);
        const txSig = await stablecoin.transferAuthority(newAuthority);
        console.log(`Authority transfer initiated to ${opts.newAuthority}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to transfer authority: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=transfer-authority.js.map