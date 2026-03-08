/**
 * Solana Stablecoin Standard (SSS) - Basic Usage Example
 *
 * Demonstrates: create, assign role, mint, transfer, burn
 *
 * Prerequisites:
 *   - Solana CLI configured with a funded keypair
 *   - Both sss-token and sss-transfer-hook programs deployed
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotent,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  SolanaStablecoin,
  Preset,
  RoleType,
  findRolePda,
  SSS_TOKEN_PROGRAM_ID,
} from "@stbr/sss-token";

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Load your authority keypair (the admin who creates the stablecoin)
  const authority = Keypair.generate(); // Replace with your funded keypair

  // --- 1. Create an SSS-2 stablecoin ---
  console.log("Creating SSS-2 stablecoin...");
  const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
    connection,
    {
      name: "Example USD",
      symbol: "eUSD",
      uri: "https://example.com/eusd.json",
      decimals: 6,
      preset: Preset.SSS_2,
      authority,
    }
  );
  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log("Tx:", txSig);

  // --- 2. Assign a Minter role ---
  console.log("\nAssigning Minter role...");
  const minter = Keypair.generate(); // In production, use a real minter wallet
  await stablecoin.updateRoles({
    roleType: RoleType.Minter,
    assignee: minter.publicKey,
    isActive: true,
  });

  // Set the minter's cumulative quota to 1,000,000 tokens
  const [minterRolePda] = findRolePda(
    stablecoin.configPda,
    RoleType.Minter,
    minter.publicKey,
    SSS_TOKEN_PROGRAM_ID
  );
  await stablecoin.updateMinterQuota({
    minterRole: minterRolePda,
    newQuota: new BN(1_000_000_000_000), // 1M tokens with 6 decimals
  });
  console.log("Minter assigned:", minter.publicKey.toBase58());

  // --- 3. Mint tokens ---
  console.log("\nMinting tokens...");
  const recipientAta = await createAssociatedTokenAccountIdempotent(
    connection,
    authority,
    mintKeypair.publicKey,
    authority.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID
  );
  await stablecoin.mint(
    recipientAta,
    new BN(1_000_000), // 1.0 eUSD (6 decimals)
    minter.publicKey
  );
  console.log("Minted 1.0 eUSD to:", recipientAta.toBase58());

  // --- 4. Burn tokens ---
  console.log("\nBurning tokens...");
  const burner = authority; // Authority can also be assigned Burner role
  await stablecoin.updateRoles({
    roleType: RoleType.Burner,
    assignee: burner.publicKey,
    isActive: true,
  });
  await stablecoin.burn(
    recipientAta,
    new BN(500_000), // 0.5 eUSD
    burner.publicKey
  );
  console.log("Burned 0.5 eUSD");

  // --- 5. Compliance: blacklist an address (SSS-2 only) ---
  console.log("\nBlacklisting address...");
  const blacklister = Keypair.generate();
  await stablecoin.updateRoles({
    roleType: RoleType.Blacklister,
    assignee: blacklister.publicKey,
    isActive: true,
  });
  const suspectWallet = Keypair.generate().publicKey;
  await stablecoin.compliance.blacklistAdd(
    suspectWallet,
    blacklister.publicKey,
    "OFAC SDN List"
  );
  console.log("Blacklisted:", suspectWallet.toBase58());

  // --- 6. Check blacklist status ---
  const isBlacklisted = await stablecoin.compliance.isBlacklisted(suspectWallet);
  console.log("Is blacklisted?", isBlacklisted); // true

  // --- 7. Read config ---
  const config = await stablecoin.getConfig();
  console.log("\nStablecoin Config:");
  console.log("  Authority:", config.authority.toBase58());
  console.log("  Paused:", config.paused);
  console.log("  Transfer Hook:", config.enableTransferHook);
  console.log("  Permanent Delegate:", config.enablePermanentDelegate);

  const supply = await stablecoin.getTotalSupply();
  console.log("  Total Supply:", supply.toString());
}

main().catch(console.error);
