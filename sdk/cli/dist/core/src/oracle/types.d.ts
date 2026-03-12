import { PublicKey } from "@solana/web3.js";
/**
 * Configuration for the Oracle Price Guard module.
 * Controls deviation thresholds, staleness limits, and circuit breaker behavior.
 */
export interface PriceGuardConfig {
    /** Pyth price feed account public key (on-chain) or Pyth feed ID hex string (Hermes API) */
    pythFeed: PublicKey | string;
    /** Target peg price (e.g., 1.0 for USD-pegged stablecoins) */
    targetPrice: number;
    /** Maximum allowed deviation from target peg in basis points (100 bps = 1%) */
    maxDeviationBps: number;
    /** Maximum allowed price staleness in seconds before the price is considered unreliable */
    maxStalenessSecs: number;
    /** Number of consecutive deviations required to trip the circuit breaker */
    circuitBreakerThreshold: number;
    /** Optional: Solana RPC URL for on-chain price account reads */
    rpcUrl?: string;
    /** Optional: Use Pyth Hermes HTTP API instead of on-chain account reads. Defaults to true. */
    useHermesApi?: boolean;
    /** Optional: Custom Hermes API base URL. Defaults to https://hermes.pyth.network */
    hermesBaseUrl?: string;
}
/**
 * Result of a single price check against the oracle.
 */
export interface PriceCheckResult {
    /** Whether the price is within acceptable deviation of the target peg */
    withinThreshold: boolean;
    /** Whether the circuit breaker is currently active (blocks minting) */
    circuitBreakerActive: boolean;
    /** Current oracle price (adjusted for exponent) */
    currentPrice: number;
    /** Price confidence interval (adjusted for exponent) */
    confidence: number;
    /** Target peg price from config */
    targetPrice: number;
    /** Absolute deviation from target peg in basis points */
    deviationBps: number;
    /** Age of the price data in seconds */
    priceAgeSecs: number;
    /** Whether the price data is stale (exceeds maxStalenessSecs) */
    isStale: boolean;
    /** Number of consecutive deviations recorded */
    consecutiveDeviations: number;
    /** Unix timestamp of the price observation */
    timestamp: number;
}
/**
 * Alert emitted when a depeg event is detected.
 */
export interface DepegAlert {
    /** Severity of the alert */
    severity: "WARNING" | "CRITICAL" | "CIRCUIT_BREAKER_TRIPPED" | "CIRCUIT_BREAKER_RESET";
    /** Human-readable message describing the alert */
    message: string;
    /** Price check result that triggered the alert */
    priceCheck: PriceCheckResult;
    /** ISO timestamp when the alert was generated */
    alertTime: string;
    /** The Pyth feed being monitored */
    feed: string;
}
/**
 * Comprehensive status of the Oracle Price Guard.
 */
export interface OracleGuardStatus {
    /** Whether the guard is actively monitoring */
    active: boolean;
    /** Whether the circuit breaker is currently tripped */
    circuitBreakerActive: boolean;
    /** Number of consecutive price deviations */
    consecutiveDeviations: number;
    /** Circuit breaker threshold from config */
    circuitBreakerThreshold: number;
    /** Most recent price check result, or null if no check has been performed */
    lastCheck: PriceCheckResult | null;
    /** Price history (most recent entries) */
    priceHistory: PriceHistoryEntry[];
    /** Recent alerts */
    recentAlerts: DepegAlert[];
    /** Configuration snapshot */
    config: PriceGuardConfig;
}
/**
 * A single price history entry for tracking trends.
 */
export interface PriceHistoryEntry {
    /** Oracle price at this point in time */
    price: number;
    /** Confidence interval */
    confidence: number;
    /** Deviation from target in basis points */
    deviationBps: number;
    /** Unix timestamp */
    timestamp: number;
}
/**
 * Raw price data parsed from Pyth (either on-chain account or Hermes API).
 */
export interface PythPriceData {
    /** Price as an integer (multiply by 10^exponent to get real price) */
    price: bigint;
    /** Confidence interval as an integer */
    confidence: bigint;
    /** Price exponent (negative number, e.g., -8 means divide by 10^8) */
    exponent: number;
    /** Unix timestamp of the price publication */
    publishTime: number;
    /** EMA (exponential moving average) price */
    emaPrice: bigint;
    /** EMA confidence */
    emaConfidence: bigint;
    /** Feed status */
    status: "Trading" | "Unknown" | "Halted" | "Auction";
}
//# sourceMappingURL=types.d.ts.map