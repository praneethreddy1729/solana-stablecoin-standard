"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintersCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const src_1 = require("../../../core/src");
const helpers_1 = require("../helpers");
exports.mintersCommand = new commander_1.Command("minters")
    .description("Manage minter roles");
exports.mintersCommand
    .command("list")
    .description("List all minter role accounts")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const accounts = await stablecoin.program.account.roleAssignment.all([
            {
                memcmp: {
                    offset: 8,
                    bytes: stablecoin.configPda.toBase58(),
                },
            },
        ]);
        const minters = accounts.filter((a) => a.account.roleType === src_1.RoleType.Minter);
        if (opts.format === "json") {
            console.log(JSON.stringify({
                count: minters.length,
                minters: minters.map((m) => {
                    const acct = m.account;
                    return {
                        address: acct.assignee.toBase58(),
                        active: acct.isActive,
                        quota: acct.minterQuota.toString(),
                        minted: acct.mintedAmount.toString(),
                    };
                }),
            }, null, 2));
            return;
        }
        if (minters.length === 0) {
            console.log("No minters found.");
            return;
        }
        console.log("=== Minters ===");
        for (const m of minters) {
            const acct = m.account;
            console.log(`  ${acct.assignee.toBase58()}`);
            console.log(`    Active: ${acct.isActive}`);
            console.log(`    Quota:  ${acct.minterQuota.toString()}`);
            console.log(`    Minted: ${acct.mintedAmount.toString()}`);
        }
    }
    catch (err) {
        console.error(`Failed to list minters: ${err.message}`);
        process.exit(1);
    }
});
exports.mintersCommand
    .command("add")
    .description("Add a minter role for an address")
    .argument("<address>", "Address to grant minter role")
    .requiredOption("--mint <address>", "Mint address")
    .option("--quota <amount>", "Set minter quota")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const assignee = new web3_js_1.PublicKey(address);
        const txSig = await stablecoin.updateRoles({
            roleType: src_1.RoleType.Minter,
            assignee,
            isActive: true,
        });
        console.log(`Added minter role for ${address}`);
        console.log(`Tx: ${txSig}`);
        if (opts.quota) {
            const [minterRole] = (0, src_1.findRolePda)(stablecoin.configPda, src_1.RoleType.Minter, assignee, src_1.SSS_TOKEN_PROGRAM_ID);
            const txSig2 = await stablecoin.updateMinterQuota({
                minterRole,
                newQuota: new bn_js_1.default(opts.quota),
            });
            console.log(`Set quota to ${opts.quota}`);
            console.log(`Tx: ${txSig2}`);
        }
    }
    catch (err) {
        console.error(`Failed to add minter: ${err.message}`);
        process.exit(1);
    }
});
exports.mintersCommand
    .command("remove")
    .description("Remove a minter role for an address")
    .argument("<address>", "Address to revoke minter role from")
    .requiredOption("--mint <address>", "Mint address")
    .option("--rpc-url <url>", "RPC URL")
    .option("--keypair <path>", "Keypair file path")
    .action(async (address, opts) => {
    try {
        const stablecoin = await (0, helpers_1.loadStablecoin)(opts.mint, opts);
        const txSig = await stablecoin.updateRoles({
            roleType: src_1.RoleType.Minter,
            assignee: new web3_js_1.PublicKey(address),
            isActive: false,
        });
        console.log(`Removed minter role for ${address}`);
        console.log(`Tx: ${txSig}`);
    }
    catch (err) {
        console.error(`Failed to remove minter: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=minters.js.map