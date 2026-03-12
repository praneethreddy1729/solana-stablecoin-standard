import { PriceGuardConfig, PriceCheckResult, DepegAlert, OracleGuardStatus, PriceHistoryEntry, PythPriceData } from "./types";
export { PYTH_FEED_IDS } from "./pyth";
export { pythPriceToNumber, fetchPythHermesPrice, fetchPythOnChainPrice } from "./pyth";
export type { PriceGuardConfig, PriceCheckResult, DepegAlert, OracleGuardStatus, PriceHistoryEntry, PythPriceData, } from "./types";
/**
 * OraclePriceGuard provides a second independent safety layer alongside Reserve Attestation.
 *
 * While Reserve Attestation guards against reserve shortfalls (reserves < supply),
 * Oracle Price Guard guards against market depegs (oracle price deviates from target peg).
 * Together they provide comprehensive protection for stablecoin operations.
 *
 * Features:
 * - Reads Pyth price feeds via Hermes HTTP API or on-chain account data
 * - Configurable deviation threshold and staleness check
 * - Circuit breaker that auto-trips after N consecutive deviations
 * - Price history tracking and depeg alert emission
 * - Supports any target peg (USD, EUR, BRL) via configurable target price
 *
 * @example
 * ```ts
 * const guard = new OraclePriceGuard({
 *   pythFeed: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
 *   targetPrice: 1.0,
 *   maxDeviationBps: 200,   // 2%
 *   maxStalenessSecs: 60,
 *   circuitBreakerThreshold: 3,
 * });
 *
 * const result = await guard.checkPrice();
 * if (result.circuitBreakerActive) {
 *   throw new Error("Circuit breaker tripped — minting blocked");
 * }
 * ```
 */
export declare class OraclePriceGuard {
    private readonly config;
    private connection;
    private consecutiveDeviations;
    private circuitBreakerActive;
    private lastCheck;
    private priceHistory;
    private recentAlerts;
    private alertCallback;
    private monitorInterval;
    constructor(config: PriceGuardConfig);
    /**
     * Set a callback function to receive depeg alerts in real-time.
     * @param callback - Function invoked with each {@link DepegAlert} as it occurs.
     */
    onAlert(callback: (alert: DepegAlert) => void): void;
    /**
     * Fetch the current price from the configured Pyth feed.
     * Tries Hermes API first (if enabled), falls back to on-chain account.
     * @returns Raw {@link PythPriceData} from Pyth.
     * @throws If the Pyth API request fails, times out, or the on-chain account cannot be read.
     */
    fetchPrice(): Promise<PythPriceData>;
    /**
     * Perform a single price check against the oracle.
     *
     * Reads the current Pyth price, calculates deviation from the target peg,
     * checks staleness, updates the circuit breaker state, and records history.
     *
     * @returns PriceCheckResult with all details of the check
     */
    checkPrice(): Promise<PriceCheckResult>;
    /**
     * Validate whether minting should be allowed based on the current oracle price.
     * Convenience method that returns a simple pass/fail with a reason.
     *
     * @returns Object with `allowed` boolean and optional `reason` string
     */
    validateMintPrice(): Promise<{
        allowed: boolean;
        reason?: string;
    }>;
    /**
     * Get the full status of the Oracle Price Guard.
     * @returns A snapshot of the guard's current state including config, history, and alerts.
     */
    getStatus(): OracleGuardStatus;
    /**
     * Manually reset the circuit breaker. Use with caution — only call this
     * after verifying the underlying depeg condition has been resolved.
     */
    resetCircuitBreaker(): void;
    /**
     * Start continuous price monitoring at the given interval.
     *
     * @param intervalMs - Polling interval in milliseconds (default: 10000 = 10s)
     * @returns A function to stop monitoring
     */
    startMonitoring(intervalMs?: number): () => void;
    /**
     * Stop continuous price monitoring.
     */
    stopMonitoring(): void;
    /**
     * Get price history entries (defensive copy).
     * @returns Array of {@link PriceHistoryEntry}, most recent last.
     */
    getPriceHistory(): PriceHistoryEntry[];
    /**
     * Get recent depeg alerts (defensive copy).
     * @returns Array of {@link DepegAlert}, most recent last.
     */
    getAlerts(): DepegAlert[];
    /**
     * Stop monitoring and release all resources.
     * Clears the monitoring interval, alert callback, price history, and alerts.
     * After calling `destroy()`, this instance should not be reused.
     */
    destroy(): void;
    private emitAlert;
    private buildAlertMessage;
}
//# sourceMappingURL=index.d.ts.map