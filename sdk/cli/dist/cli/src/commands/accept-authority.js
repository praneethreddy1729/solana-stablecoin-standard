"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptAuthorityCommand = void 0;
const commander_1 = require("commander");
const helpers_1 = require("../helpers");
exports.acceptAuthorityCommand = new commander_1.Command("accept-authority")
    .description("Accept a pending authority transfer")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const txSig = await stablecoin.acceptAuthority();
        console.log(`Authority transfer accepted`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to accept authority: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=accept-authority.js.map