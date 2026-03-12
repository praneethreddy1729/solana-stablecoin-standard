"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blacklistCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const helpers_1 = require("../helpers");
exports.blacklistCommand = new commander_1.Command("blacklist")
    .description("Manage address blacklist");
exports.blacklistCommand
    .command("add")
    .description("Add an address to the blacklist")
    .argument("<address>", "User wallet address to blacklist")
    .requiredOption("--mint <address>", "Mint address")
    .option("--reason <reason>", "Reason for blacklisting (e.g. 'OFAC match')")
    .option("--blacklister <address>", "Blacklister pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const blacklister = opts.blacklister
            ? new web3_js_1.PublicKey(opts.blacklister)
            : wallet.publicKey;
        const user = new web3_js_1.PublicKey(address);
        const txSig = await stablecoin.compliance.blacklistAdd(user, blacklister, opts.reason);
        console.log(`Added ${address} to blacklist`);
        if (opts.reason) {
            console.log(`Reason: ${opts.reason}`);
        }
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to add to blacklist: ${err.message}`);
        process.exit(1);
    }
});
exports.blacklistCommand
    .command("remove")
    .description("Remove an address from the blacklist")
    .argument("<address>", "User wallet address to unblacklist")
    .requiredOption("--mint <address>", "Mint address")
    .option("--blacklister <address>", "Blacklister pubkey (defaults to wallet)")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    try {
        const wallet = (0, helpers_1.loadWallet)(opts.keypair);
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const blacklister = opts.blacklister
            ? new web3_js_1.PublicKey(opts.blacklister)
            : wallet.publicKey;
        const user = new web3_js_1.PublicKey(address);
        const txSig = await stablecoin.compliance.blacklistRemove(user, blacklister);
        console.log(`Removed ${address} from blacklist`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to remove from blacklist: ${err.message}`);
        process.exit(1);
    }
});
exports.blacklistCommand
    .command("check")
    .description("Check if an address is blacklisted")
    .argument("<address>", "User wallet address to check")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
    const user = new web3_js_1.PublicKey(address);
    try {
        const isBlacklisted = await stablecoin.compliance.isBlacklisted(user);
        if (isBlacklisted) {
            console.log(`${address} IS blacklisted`);
        }
        else {
            console.log(`${address} is NOT blacklisted`);
        }
    }
    catch {
        // If the account doesn't exist, the user is not blacklisted
        console.log(`${address} is NOT blacklisted`);
    }
});
//# sourceMappingURL=blacklist.js.map