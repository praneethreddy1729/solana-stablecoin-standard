import { expect } from "chai";
import { OraclePriceGuard, PythPriceData } from "../src/oracle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default config for a USD-pegged stablecoin oracle guard */
function defaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    pythFeed: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    targetPrice: 1.0,
    maxDeviationBps: 200, // 2%
    maxStalenessSecs: 60,
    circuitBreakerThreshold: 3,
    useHermesApi: true,
    ...overrides,
  };
}

/**
 * Build a PythPriceData object directly (for monkey-patching fetchPrice).
 * Uses BigInt() constructor instead of literals for ES6 compat.
 */
function fakePriceData(
  price: bigint = BigInt("100000000"),
  conf: bigint = BigInt("50000"),
  expo: number = -8,
  pubTime?: number
): PythPriceData {
  return {
    price,
    confidence: conf,
    exponent: expo,
    publishTime: pubTime ?? Math.floor(Date.now() / 1000),
    emaPrice: BigInt("100000000"),
    emaConfidence: BigInt("40000"),
    status: "Trading" as const,
  };
}

/**
 * Override fetchPrice on a guard instance to return canned data.
 * This avoids any HTTP calls to the real Hermes API.
 */
function mockFetchPrice(guard: OraclePriceGuard, data: PythPriceData): void {
  (guard as any).fetchPrice = async () => data;
}

// Shorthand BigInt values used across tests
const PRICE_1_00 = BigInt("100000000");   // $1.00 with expo -8
const PRICE_1_01 = BigInt("101000000");   // $1.01
const PRICE_1_02 = BigInt("102000000");   // $1.02
const PRICE_1_05 = BigInt("105000000");   // $1.05
const PRICE_0_97 = BigInt("97000000");    // $0.97
const CONF_DEFAULT = BigInt("50000");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OraclePriceGuard", () => {
  // ========================================================================
  // 1. Constructor
  // ========================================================================

  describe("constructor", () => {
    it("sets config correctly with defaults", () => {
      const guard = new OraclePriceGuard(defaultConfig());
      const status = guard.getStatus();
      expect(status.config.targetPrice).to.equal(1.0);
      expect(status.config.maxDeviationBps).to.equal(200);
      expect(status.config.maxStalenessSecs).to.equal(60);
      expect(status.config.circuitBreakerThreshold).to.equal(3);
      expect(status.config.useHermesApi).to.equal(true);
      expect(status.config.hermesBaseUrl).to.equal("https://hermes.pyth.network");
    });

    it("rejects maxDeviationBps <= 0", () => {
      expect(() => new OraclePriceGuard(defaultConfig({ maxDeviationBps: 0 }))).to.throw(
        "maxDeviationBps must be positive"
      );
    });

    it("rejects maxStalenessSecs <= 0", () => {
      expect(() => new OraclePriceGuard(defaultConfig({ maxStalenessSecs: -1 }))).to.throw(
        "maxStalenessSecs must be positive"
      );
    });

    it("rejects circuitBreakerThreshold <= 0", () => {
      expect(() =>
        new OraclePriceGuard(defaultConfig({ circuitBreakerThreshold: 0 }))
      ).to.throw("circuitBreakerThreshold must be positive");
    });

    it("rejects targetPrice <= 0", () => {
      expect(() => new OraclePriceGuard(defaultConfig({ targetPrice: 0 }))).to.throw(
        "targetPrice must be positive"
      );
    });
  });

  // ========================================================================
  // 2. checkPrice — within threshold
  // ========================================================================

  describe("checkPrice() — within threshold", () => {
    it("returns withinThreshold=true when price is at peg", async () => {
      const guard = new OraclePriceGuard(defaultConfig());
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));

      const result = await guard.checkPrice();
      expect(result.withinThreshold).to.equal(true);
      expect(result.circuitBreakerActive).to.equal(false);
      expect(result.deviationBps).to.equal(0);
      expect(result.isStale).to.equal(false);
      expect(result.currentPrice).to.be.closeTo(1.0, 0.0001);
    });

    it("returns withinThreshold=true when price deviates within maxDeviationBps", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxDeviationBps: 200 }));
      // $1.01 => 100 bps deviation, within 200 bps threshold
      mockFetchPrice(guard, fakePriceData(PRICE_1_01, CONF_DEFAULT, -8));

      const result = await guard.checkPrice();
      expect(result.withinThreshold).to.equal(true);
      expect(result.deviationBps).to.equal(100);
    });
  });

  // ========================================================================
  // 3. checkPrice — deviation beyond threshold
  // ========================================================================

  describe("checkPrice() — deviation beyond threshold", () => {
    it("returns withinThreshold=false when price deviates beyond maxDeviationBps", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxDeviationBps: 100 }));
      // $1.02 => 200 bps deviation, exceeds 100 bps threshold
      mockFetchPrice(guard, fakePriceData(PRICE_1_02, CONF_DEFAULT, -8));

      const result = await guard.checkPrice();
      expect(result.withinThreshold).to.equal(false);
      expect(result.deviationBps).to.equal(200);
      expect(result.consecutiveDeviations).to.equal(1);
    });

    it("returns withinThreshold=false for downward depeg", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxDeviationBps: 100 }));
      // $0.97 => 300 bps deviation below peg
      mockFetchPrice(guard, fakePriceData(PRICE_0_97, CONF_DEFAULT, -8));

      const result = await guard.checkPrice();
      expect(result.withinThreshold).to.equal(false);
      expect(result.deviationBps).to.equal(300);
    });
  });

  // ========================================================================
  // 4. checkPrice — stale price detection
  // ========================================================================

  describe("checkPrice() — stale price detection", () => {
    it("detects stale prices when publishTime is too old", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxStalenessSecs: 60 }));
      // Publish time 120 seconds ago
      const staleTime = Math.floor(Date.now() / 1000) - 120;
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8, staleTime));

      const result = await guard.checkPrice();
      expect(result.isStale).to.equal(true);
      expect(result.withinThreshold).to.equal(false);
      expect(result.priceAgeSecs).to.be.gte(120);
    });

    it("marks fresh prices as not stale", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxStalenessSecs: 60 }));
      const freshTime = Math.floor(Date.now() / 1000) - 5;
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8, freshTime));

      const result = await guard.checkPrice();
      expect(result.isStale).to.equal(false);
    });
  });

  // ========================================================================
  // 5. Circuit breaker — trips after N consecutive deviations
  // ========================================================================

  describe("circuit breaker — trips after N consecutive deviations", () => {
    it("trips after circuitBreakerThreshold consecutive deviations", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 3 })
      );
      // Price at $1.05 => 500 bps, always outside 100 bps threshold
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));

      const r1 = await guard.checkPrice();
      expect(r1.consecutiveDeviations).to.equal(1);
      expect(r1.circuitBreakerActive).to.equal(false);

      const r2 = await guard.checkPrice();
      expect(r2.consecutiveDeviations).to.equal(2);
      expect(r2.circuitBreakerActive).to.equal(false);

      const r3 = await guard.checkPrice();
      expect(r3.consecutiveDeviations).to.equal(3);
      expect(r3.circuitBreakerActive).to.equal(true);

      // Stays tripped on subsequent checks
      const r4 = await guard.checkPrice();
      expect(r4.circuitBreakerActive).to.equal(true);
      expect(r4.consecutiveDeviations).to.equal(4);
    });
  });

  // ========================================================================
  // 6. Circuit breaker — auto-resets when price returns to normal
  // ========================================================================

  describe("circuit breaker — auto-reset", () => {
    it("auto-resets when price returns within threshold", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 2 })
      );

      // Trip the circuit breaker
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));
      await guard.checkPrice();
      await guard.checkPrice();
      const tripped = await guard.checkPrice();
      expect(tripped.circuitBreakerActive).to.equal(true);

      // Return to normal price
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));
      const recovered = await guard.checkPrice();
      expect(recovered.circuitBreakerActive).to.equal(false);
      expect(recovered.consecutiveDeviations).to.equal(0);
      expect(recovered.withinThreshold).to.equal(true);
    });
  });

  // ========================================================================
  // 7. resetCircuitBreaker() — manual reset
  // ========================================================================

  describe("resetCircuitBreaker()", () => {
    it("manually resets circuit breaker state", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 2 })
      );

      // Trip the circuit breaker
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));
      await guard.checkPrice();
      await guard.checkPrice();

      let status = guard.getStatus();
      expect(status.circuitBreakerActive).to.equal(true);
      expect(status.consecutiveDeviations).to.equal(2);

      // Manual reset
      guard.resetCircuitBreaker();

      status = guard.getStatus();
      expect(status.circuitBreakerActive).to.equal(false);
      expect(status.consecutiveDeviations).to.equal(0);
    });
  });

  // ========================================================================
  // 8. validateMintPrice() — returns allowed true/false
  // ========================================================================

  describe("validateMintPrice()", () => {
    it("returns allowed=true when price is within threshold", async () => {
      const guard = new OraclePriceGuard(defaultConfig());
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));

      const result = await guard.validateMintPrice();
      expect(result.allowed).to.equal(true);
      expect(result.reason).to.be.undefined;
    });

    it("returns allowed=false when circuit breaker is active", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 2 })
      );

      // Trip circuit breaker
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));
      await guard.checkPrice();
      await guard.checkPrice();

      const result = await guard.validateMintPrice();
      expect(result.allowed).to.equal(false);
      expect(result.reason).to.include("Circuit breaker active");
    });

    it("returns allowed=false when price is stale", async () => {
      const guard = new OraclePriceGuard(defaultConfig({ maxStalenessSecs: 30 }));
      const staleTime = Math.floor(Date.now() / 1000) - 120;
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8, staleTime));

      const result = await guard.validateMintPrice();
      expect(result.allowed).to.equal(false);
      expect(result.reason).to.include("stale");
    });

    it("returns allowed=false when deviation exceeds threshold (no circuit breaker yet)", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 10 })
      );
      // 500 bps deviation, threshold 100, but circuit breaker needs 10 consecutive
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));

      const result = await guard.validateMintPrice();
      expect(result.allowed).to.equal(false);
      expect(result.reason).to.include("deviation too high");
    });
  });

  // ========================================================================
  // 9. getStatus() — returns correct status object
  // ========================================================================

  describe("getStatus()", () => {
    it("returns correct initial status", () => {
      const guard = new OraclePriceGuard(defaultConfig());
      const status = guard.getStatus();

      expect(status.active).to.equal(false);
      expect(status.circuitBreakerActive).to.equal(false);
      expect(status.consecutiveDeviations).to.equal(0);
      expect(status.circuitBreakerThreshold).to.equal(3);
      expect(status.lastCheck).to.be.null;
      expect(status.priceHistory).to.be.an("array").with.lengthOf(0);
      expect(status.recentAlerts).to.be.an("array").with.lengthOf(0);
      expect(status.config.targetPrice).to.equal(1.0);
    });

    it("updates after a checkPrice call", async () => {
      const guard = new OraclePriceGuard(defaultConfig());
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));

      await guard.checkPrice();
      const status = guard.getStatus();

      expect(status.active).to.equal(true);
      expect(status.lastCheck).to.not.be.null;
      expect(status.lastCheck!.currentPrice).to.be.closeTo(1.0, 0.0001);
      expect(status.priceHistory).to.have.lengthOf(1);
    });

    it("returns a copy of arrays (not references)", () => {
      const guard = new OraclePriceGuard(defaultConfig());
      const s1 = guard.getStatus();
      const s2 = guard.getStatus();
      expect(s1.priceHistory).to.not.equal(s2.priceHistory);
      expect(s1.recentAlerts).to.not.equal(s2.recentAlerts);
    });
  });

  // ========================================================================
  // 10. Price history — tracks entries with max 100 cap
  // ========================================================================

  describe("price history", () => {
    it("tracks price history entries after each check", async () => {
      const guard = new OraclePriceGuard(defaultConfig());
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));

      await guard.checkPrice();
      await guard.checkPrice();
      await guard.checkPrice();

      const history = guard.getPriceHistory();
      expect(history).to.have.lengthOf(3);
      expect(history[0].price).to.be.closeTo(1.0, 0.0001);
      expect(history[0]).to.have.property("confidence");
      expect(history[0]).to.have.property("deviationBps");
      expect(history[0]).to.have.property("timestamp");
    });

    it("caps price history at 100 entries", async () => {
      const guard = new OraclePriceGuard(defaultConfig());
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));

      for (let i = 0; i < 110; i++) {
        await guard.checkPrice();
      }

      const history = guard.getPriceHistory();
      expect(history).to.have.lengthOf(100);
    });

    it("evicts oldest entries when exceeding cap", async () => {
      const guard = new OraclePriceGuard(defaultConfig());

      // First 100 at $1.00
      mockFetchPrice(guard, fakePriceData(PRICE_1_00, CONF_DEFAULT, -8));
      for (let i = 0; i < 100; i++) {
        await guard.checkPrice();
      }

      // 101st at $1.01
      mockFetchPrice(guard, fakePriceData(PRICE_1_01, CONF_DEFAULT, -8));
      await guard.checkPrice();

      const history = guard.getPriceHistory();
      expect(history).to.have.lengthOf(100);
      // The last entry should be the $1.01 price
      expect(history[99].price).to.be.closeTo(1.01, 0.0001);
    });
  });

  // ========================================================================
  // Bonus: alert callback
  // ========================================================================

  describe("alert callback", () => {
    it("invokes callback on deviation", async () => {
      const guard = new OraclePriceGuard(
        defaultConfig({ maxDeviationBps: 100, circuitBreakerThreshold: 3 })
      );

      const alerts: { severity: string; message: string }[] = [];
      guard.onAlert((alert) => alerts.push({ severity: alert.severity, message: alert.message }));

      // $1.05 is 500 bps off from $1.00 target; with maxDeviationBps=100,
      // 500 > 100*2 so severity is "CRITICAL" per the guard logic
      mockFetchPrice(guard, fakePriceData(PRICE_1_05, CONF_DEFAULT, -8));
      await guard.checkPrice();

      expect(alerts).to.have.lengthOf(1);
      expect(alerts[0].severity).to.equal("CRITICAL");
    });
  });
});
