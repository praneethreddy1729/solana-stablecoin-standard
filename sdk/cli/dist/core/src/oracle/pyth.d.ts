import { Connection, PublicKey } from "@solana/web3.js";
import { PythPriceData } from "./types";
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
export declare function fetchPythHermesPrice(feedId: string, hermesBaseUrl?: string, timeoutMs?: number): Promise<PythPriceData>;
/**
 * Parse a Pyth V2 price account from on-chain data.
 * Falls back to Hermes API if parsing fails.
 *
 * @param connection - Solana RPC connection
 * @param priceAccount - The Pyth price account public key
 * @returns Parsed PythPriceData
 * @throws If the account doesn't exist or isn't a valid Pyth price account
 */
export declare function fetchPythOnChainPrice(connection: Connection, priceAccount: PublicKey): Promise<PythPriceData>;
/**
 * Convert raw Pyth price data to a human-readable decimal number.
 *
 * @param rawPrice - The raw integer price from Pyth
 * @param exponent - The price exponent (usually negative, e.g., -8)
 * @returns The price as a floating-point number
 */
export declare function pythPriceToNumber(rawPrice: bigint, exponent: number): number;
/**
 * Well-known Pyth feed IDs for common stablecoin pairs.
 */
export declare const PYTH_FEED_IDS: {
    readonly "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
    readonly "USDT/USD": "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b";
    readonly "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    readonly "DAI/USD": "0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd";
    readonly "BUSD/USD": "0x5bc91f13e412c07599167bae86f07543f076a638962b8d6017ec19dab4a82814";
    readonly "EUR/USD": "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b";
    readonly "BRL/USD": "0xe14d95a4fad220e3521a205ce0e823e4dbc8b1f16b36c93ab48e8a5f5e9dd7f1";
};
//# sourceMappingURL=pyth.d.ts.map