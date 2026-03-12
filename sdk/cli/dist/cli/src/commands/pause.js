"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unpauseCommand = exports.pauseCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.pauseCommand = new commander_1.Command("pause")
    .description("Pause the token")
    .requiredOption("--mint <address>", "Mint address")
    .option("--pauser <address>", "Pauser pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const pauser = opts.pauser
            ? new web3_js_1.PublicKey(opts.pauser)
            : wallet.publicKey;
        const txSig = await stablecoin.pause({ pauser });
        console.log(`Token paused`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to pause token: ${err.message}`);
        process.exit(1);
    }
});
exports.unpauseCommand = new commander_1.Command("unpause")
    .description("Unpause the token")
    .requiredOption("--mint <address>", "Mint address")
    .option("--pauser <address>", "Pauser pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (opts) => {
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const pauser = opts.pauser
            ? new web3_js_1.PublicKey(opts.pauser)
            : wallet.publicKey;
        const txSig = await stablecoin.unpause({ pauser });
        console.log(`Token unpaused`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to unpause token: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=pause.js.map