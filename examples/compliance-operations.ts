/**
 * Compliance Operations — SSS SDK Example (SSS-2 only)
 *
 * Shows blacklisting, seizure, and oracle price guard — the compliance
 * features that distinguish SSS-2 from SSS-1.
 *
 * Prerequisites: An SSS-2 stablecoin with transfer hook enabled.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { SolanaStablecoin, RoleType } from "@stbr/sss-token";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const authority = Keypair.generate(); // Replace with your funded authority keypair
  const MINT = new PublicKey("YOUR_SSS2_MINT"); // Replace with actual SSS-2 mint

  // ── 1. Load the SSS-2 stablecoin ──
  const wallet = new Wallet(authority);
  const stable = await SolanaStablecoin.load(connection, wallet, MINT);
  const config = await stable.getConfig();
  console.log("Transfer Hook:", config.enableTransferHook);   // true for SSS-2
  console.log("Perm Delegate:", config.enablePermanentDelegate); // true for SSS-2

  // ── 2. Assign Blacklister role ──
  await stable.updateRoles({ roleType: RoleType.Blacklister, assignee: authority.publicKey, isActive: true });

  // ── 3. Blacklist a suspect address ──
  const suspect = Keypair.generate().publicKey;
  await stable.compliance.blacklistAdd(suspect, authority.publicKey, "OFAC SDN List match");
  console.log("\nBlacklisted:", suspect.toBase58());

  // ── 4. Check blacklist status ──
  const isBanned = await stable.compliance.isBlacklisted(suspect);
  console.log("Is blacklisted?", isBanned); // true

  // Transfers to/from this address will now fail via the transfer hook.
  // The hook checks both sender and receiver BlacklistEntry PDAs.

  // ── 5. Seize tokens (requires Seizer role + frozen account) ──
  // In production: freeze the account first, then seize to treasury.
  await stable.updateRoles({ roleType: RoleType.Seizer, assignee: authority.publicKey, isActive: true });
  // await stable.compliance.seize(frozenTokenAccount, treasuryAta);
  console.log("\nSeizer role assigned (seize requires a frozen account)");

  // ── 6. Remove from blacklist ──
  await stable.compliance.blacklistRemove(suspect, authority.publicKey);
  const stillBanned = await stable.compliance.isBlacklisted(suspect);
  console.log("After removal, blacklisted?", stillBanned); // false

  // ── 7. Oracle Price Guard — off-chain depeg protection ──
  stable.attachOracleGuard({
    pythFeed: "USDC/USD",     // Resolves to Pyth USDC/USD feed ID
    targetPrice: 1.0,         // Expected peg price
    maxDeviationBps: 200,     // 2% max deviation
    maxStalenessSecs: 60,     // 60s staleness threshold
    circuitBreakerThreshold: 3, // Trip after 3 consecutive deviations
  });

  const priceCheck = await stable.oracle!.checkPrice();
  console.log("\nOracle Price Check:");
  console.log("  Price:     $" + priceCheck.currentPrice.toFixed(6));
  console.log("  Deviation:", priceCheck.deviationBps, "bps");
  console.log("  Stale:    ", priceCheck.isStale);
  console.log("  CB Active:", priceCheck.circuitBreakerActive);

  // Validate before minting — integrates oracle check into mint flow
  const { allowed, reason } = await stable.oracle!.validateMintPrice();
  console.log("  Mint OK:  ", allowed, reason ?? "");
}

main().catch(console.error);
