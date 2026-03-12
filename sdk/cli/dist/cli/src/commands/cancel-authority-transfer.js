"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelAuthorityTransferCommand = void 0;
const commander_1 = require("commander");
const helpers_1 = require("../helpers");
exports.cancelAuthorityTransferCommand = new commander_1.Command("cancel-authority-transfer")
    .description("Cancel a pending authority transfer")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const txSig = await stablecoin.cancelAuthorityTransfer();
        console.log(`Authority transfer cancelled`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to cancel authority transfer: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=cancel-authority-transfer.js.map