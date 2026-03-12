"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogCommand = void 0;
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const src_1 = require("../../../core/src");
const helpers_1 = require("../helpers");
exports.auditLogCommand = new commander_1.Command("audit-log")
    .description("Query indexed events (transaction signatures)")
    .requiredOption("--mint <address>", "Mint address (used as config PDA lookup)")
    .option("--limit <n>", "Number of recent signatures to fetch", "20")
    .option("--action <type>", "Filter by action type in memo (e.g. 'mint', 'burn', 'blacklist')")
    .option("--rpc-url <url>", "RPC URL")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (opts) => {
    try {
        const connection = (0, helpers_1.getConnection)(opts.rpcUrl);
        const limit = parseInt(opts.limit, 10);
        // Derive the config PDA from the mint and query its signatures
        const mintPubkey = new web3_js_1.PublicKey(opts.mint);
        const [configPda] = (0, src_1.findConfigPda)(mintPubkey, src_1.SSS_TOKEN_PROGRAM_ID);
        const signatures = await connection.getSignaturesForAddress(configPda, { limit });
        const filtered = opts.action
            ? signatures.filter((sig) => sig.memo?.toLowerCase().includes(opts.action.toLowerCase()))
            : signatures;
        if (opts.format === "json") {
            console.log(JSON.stringify({
                configPda: configPda.toBase58(),
                count: filtered.length,
                transactions: filtered.map((sig) => ({
                    signature: sig.signature,
                    blockTime: sig.blockTime ?? null,
                    timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
                    status: sig.err ? "FAILED" : "OK",
                    error: sig.err ?? null,
                    memo: sig.memo ?? null,
                })),
            }, null, 2));
            return;
        }
        if (filtered.length === 0) {
            console.log("No transactions found.");
            return;
        }
        console.log(`=== Recent Transactions (${filtered.length}) ===`);
        for (const sig of filtered) {
            const time = sig.blockTime
                ? new Date(sig.blockTime * 1000).toISOString()
                : "unknown";
            const status = sig.err ? "FAILED" : "OK";
            console.log(`  ${time} | ${status} | ${sig.signature}`);
            if (sig.memo) {
                console.log(`    Memo: ${sig.memo}`);
            }
        }
    }
    catch (err) {
        console.error(`Failed to fetch audit log: ${err.message}`);
        process.exit(1);
    }
});
//# sourceMappingURL=audit-log.js.map