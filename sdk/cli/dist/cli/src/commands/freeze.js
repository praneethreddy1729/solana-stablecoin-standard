"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.thawCommand = exports.freezeCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.freezeCommand = new commander_1.Command("freeze [address]")
    .description("Freeze a token account")
    .requiredOption("--mint <address>", "Mint address")
    .option("--account <address>", "Token account to freeze")
    .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    const tokenAccount = address || opts.account;
    if (!tokenAccount) {
        console.error("Error: token account is required (positional arg or --account)");
        process.exit(1);
    }
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const freezer = opts.freezer
            ? new web3_js_1.PublicKey(opts.freezer)
            : wallet.publicKey;
        const txSig = await stablecoin.freeze({
            tokenAccount: new web3_js_1.PublicKey(tokenAccount),
            freezer,
        });
        console.log(`Frozen account: ${tokenAccount}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to freeze account: ${err.message}`);
        process.exit(1);
    }
});
exports.thawCommand = new commander_1.Command("thaw [address]")
    .description("Thaw a frozen token account")
    .requiredOption("--mint <address>", "Mint address")
    .option("--account <address>", "Token account to thaw")
    .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    const tokenAccount = address || opts.account;
    if (!tokenAccount) {
        console.error("Error: token account is required (positional arg or --account)");
        process.exit(1);
    }
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const freezer = opts.freezer
            ? new web3_js_1.PublicKey(opts.freezer)
            : wallet.publicKey;
        const txSig = await stablecoin.thaw({
            tokenAccount: new web3_js_1.PublicKey(tokenAccount),
            freezer,
        });
        console.log(`Thawed account: ${tokenAccount}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to thaw account: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=freeze.js.map