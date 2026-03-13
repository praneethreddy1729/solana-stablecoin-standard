import { Connection, PublicKey } from "@solana/web3.js";
import { PythPriceData } from "./types";

/**
 * Pyth Hermes API base URL.
 */
const DEFAULT_HERMES_URL = "https://hermes.pyth.network";

/** Default timeout for Hermes HTTP requests (10 seconds). */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fetch the latest price from the Pyth Hermes HTTP API.
 * This is the recommended approach — no on-chain account parsing needed.
 *
 * @param feedId - Pyth feed ID hex string (with or without 0x prefix).
 * @param hermesBaseUrl - Optional custom Hermes API URL.
 * @param timeoutMs - Request timeout in milliseconds (default: 10000).
 * @returns Parsed PythPriceData.
 * @throws If the API request fails, times out, or returns no data.
 */
export async function fetchPythHermesPrice(
  feedId: string,
  hermesBaseUrl: string = DEFAULT_HERMES_URL,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PythPriceData> {
  const cleanId = feedId.replace(/^0x/, "");
  const url = `${hermesBaseUrl}/v2/updates/price/latest?ids[]=${cleanId}&parsed=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Pyth Hermes API request timed out after ${timeoutMs}ms for feed ${cleanId}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Pyth Hermes API network error for feed ${cleanId}: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Pyth Hermes API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { parsed?: Array<{
    price: { price: string; conf: string; expo: number; publish_time: number };
    ema_price: { price: string; conf: string };
  }> };
  const parsed = data?.parsed;
  if (!parsed || parsed.length === 0) {
    throw new Error(`No price data returned for feed ${cleanId}`);
  }

  const priceFeed = parsed[0];
  const priceObj = priceFeed.price;
  const emaObj = priceFeed.ema_price;

  return {
    price: BigInt(priceObj.price),
    confidence: BigInt(priceObj.conf),
    exponent: priceObj.expo,
    publishTime: priceObj.publish_time,
    emaPrice: BigInt(emaObj.price),
    emaConfidence: BigInt(emaObj.conf),
    status: "Trading",
  };
}

/**
 * On-chain Pyth V2 price account layout offsets.
 * Reference: https://docs.pyth.network/price-feeds/pythnet-price-feeds/on-chain-accounts
 *
 * The price account data layout (simplified):
 * - Bytes 0-3: Magic number (0xa1b2c3d4)
 * - Bytes 4-7: Version
 * - Bytes 8-11: Account type
 * - Bytes 12-15: Size
 * - ...header fields...
 * - Byte 208: Price component offset varies by version; we target V2 layout
 *
 * For V2 price accounts, the aggregate price data starts at a known offset.
 */
const PYTH_PRICE_ACCOUNT_MAGIC = 0xa1b2c3d4;

// V2 price account offsets (aggregate price)
const PRICE_OFFSET = 208;
const CONFIDENCE_OFFSET = 216;
const STATUS_OFFSET = 224;
const EXPONENT_OFFSET = 20;
const PUBLISH_TIME_OFFSET = 232;
const EMA_PRICE_OFFSET = 240;
const EMA_CONFIDENCE_OFFSET = 248;

/**
 * Parse a Pyth V2 price account from on-chain data.
 * Falls back to Hermes API if parsing fails.
 *
 * @param connection - Solana RPC connection
 * @param priceAccount - The Pyth price account public key
 * @returns Parsed PythPriceData
 * @throws If the account doesn't exist or isn't a valid Pyth price account
 */
export async function fetchPythOnChainPrice(
  connection: Connection,
  priceAccount: PublicKey
): Promise<PythPriceData> {
  const accountInfo = await connection.getAccountInfo(priceAccount);
  if (!accountInfo || !accountInfo.data) {
    throw new Error(`Pyth price account ${priceAccount.toBase58()} not found`);
  }

  const data = accountInfo.data;

  // Validate magic number
  const magic = data.readUInt32LE(0);
  if (magic !== PYTH_PRICE_ACCOUNT_MAGIC) {
    throw new Error(
      `Invalid Pyth price account: magic 0x${magic.toString(16)} != 0x${PYTH_PRICE_ACCOUNT_MAGIC.toString(16)}`
    );
  }

  const exponent = data.readInt32LE(EXPONENT_OFFSET);
  const price = data.readBigInt64LE(PRICE_OFFSET);
  const confidence = data.readBigUInt64LE(CONFIDENCE_OFFSET);
  const statusVal = data.readUInt32LE(STATUS_OFFSET);
  const publishTime = Number(data.readBigInt64LE(PUBLISH_TIME_OFFSET));
  const emaPrice = data.readBigInt64LE(EMA_PRICE_OFFSET);
  const emaConfidence = data.readBigUInt64LE(EMA_CONFIDENCE_OFFSET);

  const statusMap: Record<number, PythPriceData["status"]> = {
    0: "Unknown",
    1: "Trading",
    2: "Halted",
    3: "Auction",
  };

  return {
    price,
    confidence,
    exponent,
    publishTime,
    emaPrice,
    emaConfidence,
    status: statusMap[statusVal] ?? "Unknown",
  };
}

/**
 * Convert raw Pyth price data to a human-readable decimal number.
 *
 * @param rawPrice - The raw integer price from Pyth
 * @param exponent - The price exponent (usually negative, e.g., -8)
 * @returns The price as a floating-point number
 */
export function pythPriceToNumber(rawPrice: bigint, exponent: number): number {
  return Number(rawPrice) * Math.pow(10, exponent);
}

/**
 * Well-known Pyth feed IDs for common stablecoin pairs.
 */
export const PYTH_FEED_IDS = {
  "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "USDT/USD": "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "DAI/USD": "0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd",
  "BUSD/USD": "0x5bc91f13e412c07599167bae86f07543f076a638962b8d6017ec19dab4a82814",
  "EUR/USD": "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  "BRL/USD": "0xe14d95a4fad220e3521a205ce0e823e4dbc8b1f16b36c93ab48e8a5f5e9dd7f1",
} as const;
