/**
 * Create Stablecoin — SSS SDK Example
 *
 * Shows how to create SSS-1 (basic) and SSS-2 (compliance) stablecoins,
 * and how to load an existing one by mint address.
 *
 * Prerequisites: Solana CLI configured, funded keypair, programs deployed.
 */

import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const authority = Keypair.generate(); // Replace with your funded keypair

  // ── 1. Create an SSS-1 stablecoin (basic: mint/burn/pause/freeze) ──
  const sss1 = await SolanaStablecoin.create(connection, {
    name: "Basic Dollar",
    symbol: "bUSD",
    uri: "https://example.com/busd-metadata.json",
    decimals: 6,
    preset: Preset.SSS_1,
    authority,
  });

  console.log("SSS-1 Created");
  console.log("  Mint:   ", sss1.mintKeypair.publicKey.toBase58());
  console.log("  Config: ", sss1.stablecoin.configPda.toBase58());
  console.log("  Tx:     ", sss1.txSig);

  // ── 2. Create an SSS-2 stablecoin (full compliance: hook + blacklist + seize) ──
  const sss2 = await SolanaStablecoin.create(connection, {
    name: "Compliant Dollar",
    symbol: "cUSD",
    uri: "https://example.com/cusd-metadata.json",
    decimals: 6,
    preset: Preset.SSS_2,
    authority,
  });

  console.log("\nSSS-2 Created");
  console.log("  Mint:   ", sss2.mintKeypair.publicKey.toBase58());
  console.log("  Config: ", sss2.stablecoin.configPda.toBase58());
  console.log("  Tx:     ", sss2.txSig);
  console.log("  Hook Tx:", sss2.hookTxSig); // ExtraAccountMetas auto-initialized

  // ── 3. Verify on-chain config ──
  const config = await sss2.stablecoin.getConfig();
  console.log("\nSSS-2 Config:");
  console.log("  Authority:          ", config.authority.toBase58());
  console.log("  Transfer Hook:      ", config.enableTransferHook);
  console.log("  Permanent Delegate: ", config.enablePermanentDelegate);
  console.log("  Paused:             ", config.paused);

  // ── 4. Load an existing stablecoin by mint address ──
  const { Wallet } = await import("@coral-xyz/anchor");
  const wallet = new Wallet(authority);
  const loaded = await SolanaStablecoin.load(
    connection,
    wallet,
    sss2.mintKeypair.publicKey,
  );
  const loadedConfig = await loaded.getConfig();
  console.log("\nLoaded existing stablecoin:", loadedConfig.mint.toBase58());

  // ── 5. Discover all registered stablecoins ──
  const all = await SolanaStablecoin.listAll(connection, wallet);
  console.log(`\nRegistry: ${all.length} stablecoin(s) found`);
  for (const entry of all) {
    console.log(`  ${entry.symbol} — ${entry.mint.toBase58()}`);
  }
}

main().catch(console.error);
