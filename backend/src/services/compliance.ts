import { PublicKey } from "@solana/web3.js";
import pino from "pino";

const logger = pino({ name: "compliance-service" });

export interface ScreeningResult {
  address: string;
  sanctioned: boolean;
  timestamp: number;
  source: string;
}

const auditLog: ScreeningResult[] = [];

// Mock OFAC sanctions list for demo purposes
const MOCK_SANCTIONED_ADDRESSES = new Set([
  "SanctionedAddress1111111111111111111111111",
  "SanctionedAddress2222222222222222222222222",
]);

export async function screenAddress(address: string): Promise<ScreeningResult> {
  // Validate it's a valid Solana address
  try {
    new PublicKey(address);
  } catch {
    throw new Error(`Invalid Solana address: ${address}`);
  }

  const sanctionsApiUrl = process.env.SANCTIONS_API_URL;
  let sanctioned = false;

  if (sanctionsApiUrl) {
    // Production: call external sanctions API
    try {
      const res = await fetch(`${sanctionsApiUrl}/check?address=${address}`);
      if (!res.ok) throw new Error(`Sanctions API returned ${res.status}`);
      const data = (await res.json()) as { sanctioned: boolean };
      sanctioned = data.sanctioned;
    } catch (err) {
      logger.error({ err }, "Sanctions API call failed, falling back to mock");
      sanctioned = MOCK_SANCTIONED_ADDRESSES.has(address);
    }
  } else {
    // Mock screening
    sanctioned = MOCK_SANCTIONED_ADDRESSES.has(address);
  }

  const result: ScreeningResult = {
    address,
    sanctioned,
    timestamp: Date.now(),
    source: sanctionsApiUrl ? "external" : "mock",
  };

  auditLog.push(result);
  return result;
}

export function getAuditLog(limit = 100, offset = 0): ScreeningResult[] {
  return auditLog.slice(offset, offset + limit);
}

export function getAuditLogCount(): number {
  return auditLog.length;
}
