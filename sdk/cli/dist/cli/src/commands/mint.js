"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const helpers_1 = require("../helpers");
exports.mintCommand = new commander_1.Command("mint [recipient] [amount]")
    .description("Mint tokens")
    .requiredOption("--mint <address>", "Mint address")
    .option("--to <address>", "Recipient token account")
    .option("--amount <amount>", "Amount to mint (raw units)")
    .option("--minter <address>", "Minter pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (recipient, amount, opts) => {
    const recipientAddr = recipient || opts.to;
    const mintAmount = amount || opts.amount;
    if (!recipientAddr) {
        console.error("Error: recipient address is required (positional arg or --to)");
        process.exit(1);
    }
    if (!mintAmount) {
        console.error("Error: amount is required (positional arg or --amount)");
        process.exit(1);
    }
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const minter = opts.minter
            ? new web3_js_1.PublicKey(opts.minter)
            : wallet.publicKey;
        const txSig = await stablecoin.mint(new web3_js_1.PublicKey(recipientAddr), new bn_js_1.default(mintAmount), minter);
        console.log(`Minted ${mintAmount} tokens to ${recipientAddr}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to mint: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=mint.js.map