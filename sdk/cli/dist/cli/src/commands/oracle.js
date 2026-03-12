"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oracleCommand = void 0;
const commander_1 = require("commander");
const oracle_1 = require("../../../core/src/oracle");
/** Resolve a feed name alias (e.g., "USDC/USD") or pass through a raw hex ID. */
function resolveFeedId(feed) {
    const upper = feed.toUpperCase();
    const known = oracle_1.PYTH_FEED_IDS;
    if (known[upper])
        return known[upper];
    // Accept raw hex with or without 0x prefix
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(feed))
        return feed;
    throw new Error(`Unknown feed "${feed}". Use a hex feed ID or one of: ${Object.keys(oracle_1.PYTH_FEED_IDS).join(", ")}`);
}
function formatSeverity(severity) {
    switch (severity) {
        case "WARNING":
            return "\x1b[33m[WARNING]\x1b[0m";
        case "CRITICAL":
            return "\x1b[31m[CRITICAL]\x1b[0m";
        case "CIRCUIT_BREAKER_TRIPPED":
            return "\x1b[31;1m[CIRCUIT BREAKER TRIPPED]\x1b[0m";
        case "CIRCUIT_BREAKER_RESET":
            return "\x1b[32m[CIRCUIT BREAKER RESET]\x1b[0m";
    }
}
exports.oracleCommand = new commander_1.Command("oracle")
    .description("Oracle Price Guard — monitor Pyth price feeds and detect stablecoin depegs");
exports.oracleCommand
    .command("status")
    .description("Show current oracle price, deviation, and circuit breaker state")
    .requiredOption("--feed <feed_id>", "Pyth feed ID (hex) or alias (e.g., USDC/USD)")
    .option("--target <price>", "Target peg price", "1.0")
    .option("--max-deviation <bps>", "Max deviation in basis points", "200")
    .option("--max-staleness <secs>", "Max price staleness in seconds", "60")
    .option("--circuit-breaker <n>", "Circuit breaker threshold (consecutive deviations)", "3")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (opts) => {
    try {
        const feedId = resolveFeedId(opts.feed);
        const guard = new oracle_1.OraclePriceGuard({
            pythFeed: feedId,
            targetPrice: parseFloat(opts.target),
            maxDeviationBps: parseInt(opts.maxDeviation, 10),
            maxStalenessSecs: parseInt(opts.maxStaleness, 10),
            circuitBreakerThreshold: parseInt(opts.circuitBreaker, 10),
        });
        const check = await guard.checkPrice();
        if (opts.format === "json") {
            console.log(JSON.stringify(check, null, 2));
        }
        else {
            console.log("=== Oracle Price Guard Status ===");
            console.log(`Feed:                   ${feedId.slice(0, 16)}...${feedId.slice(-8)}`);
            console.log(`Target Price:           $${check.targetPrice}`);
            console.log(`Current Price:          $${check.currentPrice.toFixed(8)}`);
            console.log(`Confidence:             \u00b1$${check.confidence.toFixed(8)}`);
            console.log(`Deviation:              ${check.deviationBps} bps`);
            console.log(`Max Allowed Deviation:  ${opts.maxDeviation} bps`);
            console.log(`Price Age:              ${check.priceAgeSecs}s`);
            console.log(`Stale:                  ${check.isStale ? "\x1b[31mYES\x1b[0m" : "\x1b[32mNO\x1b[0m"}`);
            console.log(`Within Threshold:       ${check.withinThreshold ? "\x1b[32mYES\x1b[0m" : "\x1b[31mNO\x1b[0m"}`);
            console.log(`Circuit Breaker Active: ${check.circuitBreakerActive ? "\x1b[31mYES\x1b[0m" : "\x1b[32mNO\x1b[0m"}`);
            console.log(`Consecutive Deviations: ${check.consecutiveDeviations}/${opts.circuitBreaker}`);
            if (check.circuitBreakerActive) {
                console.log("\n\x1b[31;1m*** MINTING IS BLOCKED — Circuit breaker tripped ***\x1b[0m");
            }
            else if (!check.withinThreshold) {
                console.log("\n\x1b[33m*** WARNING: Price outside threshold ***\x1b[0m");
            }
            else {
                console.log("\n\x1b[32m*** OK: Price within safe range ***\x1b[0m");
            }
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
    }
});
exports.oracleCommand
    .command("guard")
    .description("Run continuous price monitoring with real-time depeg alerts")
    .requiredOption("--feed <feed_id>", "Pyth feed ID (hex) or alias (e.g., USDC/USD)")
    .option("--target <price>", "Target peg price", "1.0")
    .option("--max-deviation <bps>", "Max deviation in basis points", "200")
    .option("--max-staleness <secs>", "Max price staleness in seconds", "60")
    .option("--circuit-breaker <n>", "Circuit breaker threshold (consecutive deviations)", "3")
    .option("--interval <ms>", "Polling interval in milliseconds", "10000")
    .action(async (opts) => {
    try {
        const feedId = resolveFeedId(opts.feed);
        const guard = new oracle_1.OraclePriceGuard({
            pythFeed: feedId,
            targetPrice: parseFloat(opts.target),
            maxDeviationBps: parseInt(opts.maxDeviation, 10),
            maxStalenessSecs: parseInt(opts.maxStaleness, 10),
            circuitBreakerThreshold: parseInt(opts.circuitBreaker, 10),
        });
        const intervalMs = parseInt(opts.interval, 10);
        console.log("=== Oracle Price Guard — Continuous Monitoring ===");
        console.log(`Feed:              ${feedId.slice(0, 16)}...${feedId.slice(-8)}`);
        console.log(`Target:            $${opts.target}`);
        console.log(`Max Deviation:     ${opts.maxDeviation} bps`);
        console.log(`Max Staleness:     ${opts.maxStaleness}s`);
        console.log(`Circuit Breaker:   After ${opts.circuitBreaker} consecutive deviations`);
        console.log(`Poll Interval:     ${intervalMs}ms`);
        console.log(`Started:           ${new Date().toISOString()}`);
        console.log("---");
        console.log("Press Ctrl+C to stop.\n");
        guard.onAlert((alert) => {
            console.log(`${formatSeverity(alert.severity)} ${alert.alertTime} — ${alert.message}`);
        });
        const stop = guard.startMonitoring(intervalMs);
        // Print periodic status updates
        const statusInterval = setInterval(async () => {
            try {
                const status = guard.getStatus();
                const lc = status.lastCheck;
                if (lc) {
                    const cbState = lc.circuitBreakerActive ? "\x1b[31mBLOCKED\x1b[0m" : "\x1b[32mOK\x1b[0m";
                    console.log(`[${new Date().toISOString()}] $${lc.currentPrice.toFixed(6)} | ` +
                        `dev: ${lc.deviationBps}bps | age: ${lc.priceAgeSecs}s | ` +
                        `streak: ${lc.consecutiveDeviations}/${opts.circuitBreaker} | ${cbState}`);
                }
            }
            catch {
                // Ignore status print errors
            }
        }, Math.max(intervalMs, 10000));
        // Handle graceful shutdown
        const shutdown = () => {
            console.log("\nStopping Oracle Price Guard...");
            stop();
            clearInterval(statusInterval);
            const status = guard.getStatus();
            console.log(`\nFinal status: ${status.priceHistory.length} prices recorded, ${status.recentAlerts.length} alerts.`);
            process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        // Keep the process alive
        await new Promise(() => { });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
    }
});
exports.oracleCommand
    .command("feeds")
    .description("List well-known Pyth feed IDs for stablecoins")
    .option("--format <format>", "Output format: text or json", "text")
    .action((opts) => {
    if (opts.format === "json") {
        console.log(JSON.stringify(oracle_1.PYTH_FEED_IDS, null, 2));
    }
    else {
        console.log("=== Known Pyth Feed IDs ===");
        for (const [pair, id] of Object.entries(oracle_1.PYTH_FEED_IDS)) {
            console.log(`  ${pair.padEnd(12)} ${id}`);
        }
    }
});
exports.oracleCommand
    .command("validate-mint")
    .description("Check whether minting should be allowed based on current oracle price")
    .requiredOption("--feed <feed_id>", "Pyth feed ID (hex) or alias (e.g., USDC/USD)")
    .option("--target <price>", "Target peg price", "1.0")
    .option("--max-deviation <bps>", "Max deviation in basis points", "200")
    .option("--max-staleness <secs>", "Max price staleness in seconds", "60")
    .option("--circuit-breaker <n>", "Circuit breaker threshold", "3")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (opts) => {
    try {
        const feedId = resolveFeedId(opts.feed);
        const guard = new oracle_1.OraclePriceGuard({
            pythFeed: feedId,
            targetPrice: parseFloat(opts.target),
            maxDeviationBps: parseInt(opts.maxDeviation, 10),
            maxStalenessSecs: parseInt(opts.maxStaleness, 10),
            circuitBreakerThreshold: parseInt(opts.circuitBreaker, 10),
        });
        const result = await guard.validateMintPrice();
        if (opts.format === "json") {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            if (result.allowed) {
                console.log("\x1b[32m\u2713 Minting ALLOWED\x1b[0m — Oracle price is within safe range.");
            }
            else {
                console.log(`\x1b[31m\u2717 Minting BLOCKED\x1b[0m — ${result.reason}`);
            }
        }
        process.exit(result.allowed ? 0 : 1);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
    }
});
//# sourceMappingURL=oracle.js.map