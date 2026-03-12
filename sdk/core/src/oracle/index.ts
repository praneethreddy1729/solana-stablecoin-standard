import { Connection, PublicKey } from "@solana/web3.js";
import {
  PriceGuardConfig,
  PriceCheckResult,
  DepegAlert,
  OracleGuardStatus,
  PriceHistoryEntry,
  PythPriceData,
} from "./types";
import {
  fetchPythHermesPrice,
  fetchPythOnChainPrice,
  pythPriceToNumber,
  PYTH_FEED_IDS,
} from "./pyth";

export { PYTH_FEED_IDS } from "./pyth";
export { pythPriceToNumber, fetchPythHermesPrice, fetchPythOnChainPrice } from "./pyth";
export type {
  PriceGuardConfig,
  PriceCheckResult,
  DepegAlert,
  OracleGuardStatus,
  PriceHistoryEntry,
  PythPriceData,
} from "./types";

/** Maximum number of price history entries to retain */
const MAX_HISTORY_SIZE = 100;
/** Maximum number of recent alerts to retain */
const MAX_ALERTS_SIZE = 50;

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
export class OraclePriceGuard {
  private readonly config: PriceGuardConfig;
  private connection: Connection | null = null;

  private consecutiveDeviations = 0;
  private circuitBreakerActive = false;
  private lastCheck: PriceCheckResult | null = null;
  private priceHistory: PriceHistoryEntry[] = [];
  private recentAlerts: DepegAlert[] = [];
  private alertCallback: ((alert: DepegAlert) => void) | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: PriceGuardConfig) {
    if (config.maxDeviationBps <= 0) {
      throw new Error("maxDeviationBps must be positive");
    }
    if (config.maxStalenessSecs <= 0) {
      throw new Error("maxStalenessSecs must be positive");
    }
    if (config.circuitBreakerThreshold <= 0) {
      throw new Error("circuitBreakerThreshold must be positive");
    }
    if (config.targetPrice <= 0) {
      throw new Error("targetPrice must be positive");
    }

    this.config = {
      useHermesApi: true,
      hermesBaseUrl: "https://hermes.pyth.network",
      ...config,
    };

    if (!this.config.useHermesApi || config.rpcUrl) {
      this.connection = new Connection(
        config.rpcUrl ?? "https://api.mainnet-beta.solana.com",
        "confirmed"
      );
    }
  }

  /**
   * Set a callback function to receive depeg alerts in real-time.
   * @param callback - Function invoked with each {@link DepegAlert} as it occurs.
   */
  onAlert(callback: (alert: DepegAlert) => void): void {
    this.alertCallback = callback;
  }

  /**
   * Fetch the current price from the configured Pyth feed.
   * Tries Hermes API first (if enabled), falls back to on-chain account.
   * @returns Raw {@link PythPriceData} from Pyth.
   * @throws If the Pyth API request fails, times out, or the on-chain account cannot be read.
   */
  async fetchPrice(): Promise<PythPriceData> {
    const feed = this.config.pythFeed;

    // If useHermesApi and feed is a string (feed ID), use Hermes
    if (this.config.useHermesApi && typeof feed === "string") {
      return fetchPythHermesPrice(feed, this.config.hermesBaseUrl);
    }

    // If feed is a PublicKey, use on-chain account parsing
    if (feed instanceof PublicKey) {
      if (!this.connection) {
        this.connection = new Connection(
          this.config.rpcUrl ?? "https://api.mainnet-beta.solana.com",
          "confirmed"
        );
      }
      return fetchPythOnChainPrice(this.connection, feed);
    }

    // Feed is a hex string but useHermesApi is false — try Hermes anyway
    return fetchPythHermesPrice(
      feed as string,
      this.config.hermesBaseUrl
    );
  }

  /**
   * Perform a single price check against the oracle.
   *
   * Reads the current Pyth price, calculates deviation from the target peg,
   * checks staleness, updates the circuit breaker state, and records history.
   *
   * @returns PriceCheckResult with all details of the check
   */
  async checkPrice(): Promise<PriceCheckResult> {
    const priceData = await this.fetchPrice();
    const now = Math.floor(Date.now() / 1000);

    const currentPrice = pythPriceToNumber(priceData.price, priceData.exponent);
    const confidence = pythPriceToNumber(priceData.confidence, priceData.exponent);
    const priceAgeSecs = now - priceData.publishTime;
    const isStale = priceAgeSecs > this.config.maxStalenessSecs;

    // Calculate deviation in basis points
    const deviation = Math.abs(currentPrice - this.config.targetPrice);
    const deviationBps = Math.round((deviation / this.config.targetPrice) * 10000);

    const withinThreshold = deviationBps <= this.config.maxDeviationBps && !isStale;

    // Update circuit breaker state
    if (!withinThreshold) {
      this.consecutiveDeviations++;
      if (this.consecutiveDeviations >= this.config.circuitBreakerThreshold) {
        if (!this.circuitBreakerActive) {
          this.circuitBreakerActive = true;
          this.emitAlert("CIRCUIT_BREAKER_TRIPPED", currentPrice, deviationBps, priceAgeSecs);
        }
      } else {
        // Warn on deviation but circuit breaker not yet tripped
        const severity = deviationBps > this.config.maxDeviationBps * 2 ? "CRITICAL" : "WARNING";
        this.emitAlert(severity, currentPrice, deviationBps, priceAgeSecs);
      }
    } else {
      // Price is back within threshold
      if (this.consecutiveDeviations > 0 || this.circuitBreakerActive) {
        if (this.circuitBreakerActive) {
          this.emitAlert("CIRCUIT_BREAKER_RESET", currentPrice, deviationBps, priceAgeSecs);
        }
        this.consecutiveDeviations = 0;
        this.circuitBreakerActive = false;
      }
    }

    const result: PriceCheckResult = {
      withinThreshold,
      circuitBreakerActive: this.circuitBreakerActive,
      currentPrice,
      confidence,
      targetPrice: this.config.targetPrice,
      deviationBps,
      priceAgeSecs,
      isStale,
      consecutiveDeviations: this.consecutiveDeviations,
      timestamp: priceData.publishTime,
    };

    this.lastCheck = result;

    // Record in price history
    this.priceHistory.push({
      price: currentPrice,
      confidence,
      deviationBps,
      timestamp: priceData.publishTime,
    });
    if (this.priceHistory.length > MAX_HISTORY_SIZE) {
      this.priceHistory.shift();
    }

    return result;
  }

  /**
   * Validate whether minting should be allowed based on the current oracle price.
   * Convenience method that returns a simple pass/fail with a reason.
   *
   * @returns Object with `allowed` boolean and optional `reason` string
   */
  async validateMintPrice(): Promise<{ allowed: boolean; reason?: string }> {
    const check = await this.checkPrice();

    if (check.circuitBreakerActive) {
      return {
        allowed: false,
        reason: `Circuit breaker active: ${check.consecutiveDeviations} consecutive deviations. Price $${check.currentPrice.toFixed(6)} deviates ${check.deviationBps}bps from target $${check.targetPrice}.`,
      };
    }

    if (check.isStale) {
      return {
        allowed: false,
        reason: `Price data is stale: ${check.priceAgeSecs}s old (max ${this.config.maxStalenessSecs}s).`,
      };
    }

    if (!check.withinThreshold) {
      return {
        allowed: false,
        reason: `Price deviation too high: ${check.deviationBps}bps (max ${this.config.maxDeviationBps}bps). Price $${check.currentPrice.toFixed(6)} vs target $${check.targetPrice}.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get the full status of the Oracle Price Guard.
   * @returns A snapshot of the guard's current state including config, history, and alerts.
   */
  getStatus(): OracleGuardStatus {
    return {
      active: this.monitorInterval !== null || this.lastCheck !== null,
      circuitBreakerActive: this.circuitBreakerActive,
      consecutiveDeviations: this.consecutiveDeviations,
      circuitBreakerThreshold: this.config.circuitBreakerThreshold,
      lastCheck: this.lastCheck,
      priceHistory: [...this.priceHistory],
      recentAlerts: [...this.recentAlerts],
      config: { ...this.config },
    };
  }

  /**
   * Manually reset the circuit breaker. Use with caution — only call this
   * after verifying the underlying depeg condition has been resolved.
   */
  resetCircuitBreaker(): void {
    this.consecutiveDeviations = 0;
    this.circuitBreakerActive = false;
  }

  /**
   * Start continuous price monitoring at the given interval.
   *
   * @param intervalMs - Polling interval in milliseconds (default: 10000 = 10s)
   * @returns A function to stop monitoring
   */
  startMonitoring(intervalMs: number = 10000): () => void {
    if (this.monitorInterval) {
      throw new Error("Monitoring is already active. Call stopMonitoring() first.");
    }

    // Perform an immediate check
    this.checkPrice().catch((err) => {
      this.emitAlert("WARNING", 0, 0, 0, `Price fetch error: ${err.message}`);
    });

    this.monitorInterval = setInterval(() => {
      this.checkPrice().catch((err) => {
        this.emitAlert("WARNING", 0, 0, 0, `Price fetch error: ${err.message}`);
      });
    }, intervalMs);

    return () => this.stopMonitoring();
  }

  /**
   * Stop continuous price monitoring.
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Get price history entries (defensive copy).
   * @returns Array of {@link PriceHistoryEntry}, most recent last.
   */
  getPriceHistory(): PriceHistoryEntry[] {
    return [...this.priceHistory];
  }

  /**
   * Get recent depeg alerts (defensive copy).
   * @returns Array of {@link DepegAlert}, most recent last.
   */
  getAlerts(): DepegAlert[] {
    return [...this.recentAlerts];
  }

  /**
   * Stop monitoring and release all resources.
   * Clears the monitoring interval, alert callback, price history, and alerts.
   * After calling `destroy()`, this instance should not be reused.
   */
  destroy(): void {
    this.stopMonitoring();
    this.alertCallback = null;
    this.priceHistory = [];
    this.recentAlerts = [];
    this.lastCheck = null;
    this.consecutiveDeviations = 0;
    this.circuitBreakerActive = false;
    this.connection = null;
  }

  private emitAlert(
    severity: DepegAlert["severity"],
    price: number,
    deviationBps: number,
    priceAgeSecs: number,
    customMessage?: string
  ): void {
    const feedStr =
      typeof this.config.pythFeed === "string"
        ? this.config.pythFeed
        : this.config.pythFeed.toBase58();

    const message =
      customMessage ??
      this.buildAlertMessage(severity, price, deviationBps, priceAgeSecs);

    const alert: DepegAlert = {
      severity,
      message,
      priceCheck: this.lastCheck ?? {
        withinThreshold: false,
        circuitBreakerActive: this.circuitBreakerActive,
        currentPrice: price,
        confidence: 0,
        targetPrice: this.config.targetPrice,
        deviationBps,
        priceAgeSecs,
        isStale: priceAgeSecs > this.config.maxStalenessSecs,
        consecutiveDeviations: this.consecutiveDeviations,
        timestamp: Math.floor(Date.now() / 1000),
      },
      alertTime: new Date().toISOString(),
      feed: feedStr,
    };

    this.recentAlerts.push(alert);
    if (this.recentAlerts.length > MAX_ALERTS_SIZE) {
      this.recentAlerts.shift();
    }

    if (this.alertCallback) {
      this.alertCallback(alert);
    }
  }

  private buildAlertMessage(
    severity: DepegAlert["severity"],
    price: number,
    deviationBps: number,
    priceAgeSecs: number
  ): string {
    switch (severity) {
      case "WARNING":
        return `Price deviation detected: $${price.toFixed(6)} (${deviationBps}bps from target $${this.config.targetPrice}). ` +
          `Consecutive deviations: ${this.consecutiveDeviations}/${this.config.circuitBreakerThreshold}.`;
      case "CRITICAL":
        return `CRITICAL price deviation: $${price.toFixed(6)} (${deviationBps}bps from target $${this.config.targetPrice}). ` +
          `Consecutive deviations: ${this.consecutiveDeviations}/${this.config.circuitBreakerThreshold}.`;
      case "CIRCUIT_BREAKER_TRIPPED":
        return `CIRCUIT BREAKER TRIPPED: ${this.consecutiveDeviations} consecutive deviations exceeded threshold of ${this.config.circuitBreakerThreshold}. ` +
          `Minting is now blocked. Price: $${price.toFixed(6)}, deviation: ${deviationBps}bps.`;
      case "CIRCUIT_BREAKER_RESET":
        return `Circuit breaker reset: price returned within threshold at $${price.toFixed(6)} (${deviationBps}bps). Minting resumed.`;
    }
  }
}
