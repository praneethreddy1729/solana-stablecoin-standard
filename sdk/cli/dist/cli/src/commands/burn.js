"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.burnCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const helpers_1 = require("../helpers");
exports.burnCommand = new commander_1.Command("burn [amount]")
    .description("Burn tokens")
    .requiredOption("--mint <address>", "Mint address")
    .option("--from <address>", "Source token account (defaults to authority ATA)")
    .option("--amount <amount>", "Amount to burn (raw units)")
    .option("--from-authority <address>", "Token account authority (defaults to wallet)")
    .option("--burner <address>", "Burner pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (amount, opts) => {
    const burnAmount = amount || opts.amount;
    if (!burnAmount) {
        console.error("Error: amount is required (positional arg or --amount)");
        process.exit(1);
    }
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const burner = opts.burner
            ? new web3_js_1.PublicKey(opts.burner)
            : wallet.publicKey;
        const fromAuthority = opts.fromAuthority
            ? new web3_js_1.PublicKey(opts.fromAuthority)
            : wallet.publicKey;
        // Default --from to the authority's ATA derived from mint + TOKEN_2022_PROGRAM_ID
        const fromAccount = opts.from
            ? new web3_js_1.PublicKey(opts.from)
            : (0, spl_token_1.getAssociatedTokenAddressSync)(new web3_js_1.PublicKey(opts.mint), fromAuthority, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        const txSig = await stablecoin.burn(fromAccount, new bn_js_1.default(burnAmount), burner, fromAuthority);
        console.log(`Burned ${burnAmount} tokens from ${fromAccount.toBase58()}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to burn: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=burn.js.map