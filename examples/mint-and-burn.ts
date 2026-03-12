/**
 * Mint & Burn Lifecycle — SSS SDK Example
 *
 * Shows the full token lifecycle: assign roles, set quota, mint, check
 * balance, burn, and verify supply changes.
 *
 * Prerequisites: An SSS stablecoin already created (see create-stablecoin.ts).
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  SolanaStablecoin,
  RoleType,
  findRolePda,
  SSS_TOKEN_PROGRAM_ID,
} from "@stbr/sss-token";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const authority = Keypair.generate(); // Replace with your funded authority keypair
  const MINT = new PublicKey("YOUR_MINT_ADDRESS"); // Replace with actual mint

  // ── 1. Load the stablecoin ──
  const wallet = new Wallet(authority);
  const stable = await SolanaStablecoin.load(connection, wallet, MINT);
  console.log("Loaded stablecoin:", MINT.toBase58());

  // ── 2. Assign Minter and Burner roles ──
  const minter = Keypair.generate();
  await stable.updateRoles({ roleType: RoleType.Minter, assignee: minter.publicKey, isActive: true });
  await stable.updateRoles({ roleType: RoleType.Burner, assignee: authority.publicKey, isActive: true });
  console.log("Minter assigned:", minter.publicKey.toBase58());

  // ── 3. Set minter quota (1M tokens at 6 decimals) ──
  const [minterRolePda] = findRolePda(stable.configPda, RoleType.Minter, minter.publicKey, SSS_TOKEN_PROGRAM_ID);
  await stable.updateMinterQuota({ minterRole: minterRolePda, newQuota: new BN(1_000_000_000_000) });
  console.log("Minter quota set: 1,000,000 tokens");

  // ── 4. Create recipient ATA and mint tokens ──
  const recipient = Keypair.generate();
  const recipientAta = await createAssociatedTokenAccountIdempotent(
    connection, authority, MINT, recipient.publicKey, {}, TOKEN_2022_PROGRAM_ID,
  );
  await stable.mint(recipientAta, new BN(5_000_000), minter.publicKey); // 5.0 tokens
  console.log("Minted 5.0 tokens to", recipient.publicKey.toBase58());

  // ── 5. Check balance and supply ──
  const account = await getAccount(connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("Balance:", account.amount.toString()); // "5000000"
  const supply = await stable.getTotalSupply();
  console.log("Total supply:", supply.toString());

  // ── 6. Burn tokens ──
  const authorityAta = await createAssociatedTokenAccountIdempotent(
    connection, authority, MINT, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID,
  );
  // Mint some to authority's own ATA, then burn
  await stable.mint(authorityAta, new BN(2_000_000), minter.publicKey);
  await stable.burn(authorityAta, new BN(1_000_000), authority.publicKey); // burn 1.0
  console.log("Burned 1.0 tokens from authority");

  // ── 7. Verify supply decreased ──
  const newSupply = await stable.getTotalSupply();
  console.log("Supply after burn:", newSupply.toString());
}

main().catch(console.error);
