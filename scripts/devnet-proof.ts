/**
 * Devnet Proof Script — Solana Stablecoin Standard (SSS)
 *
 * Demonstrates the full SSS-1 lifecycle on Solana devnet:
 *   1. Create an SSS-1 stablecoin
 *   2. Assign Minter + Burner roles
 *   3. Set minter quota
 *   4. Mint tokens
 *   5. Burn tokens
 *
 * Usage:
 *   npx ts-node scripts/devnet-proof.ts
 *
 * Prerequisites:
 *   - Solana CLI configured with a funded devnet wallet (~0.5 SOL)
 *   - Programs deployed on devnet (sss-token + sss-transfer-hook)
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";

import { SolanaStablecoin } from "../sdk/core/src/SolanaStablecoin";
import { Preset, RoleType } from "../sdk/core/src/types";
import { findRolePda } from "../sdk/core/src/pda";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../sdk/core/src/constants";

const DEVNET_URL = "https://api.devnet.solana.com";
const EXPLORER = "https://explorer.solana.com/tx";

function loadKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR ||
    path.join(process.env.HOME!, ".config", "solana", "id.json");
  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function txLink(sig: string): string {
  return `${EXPLORER}/${sig}?cluster=devnet`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== SSS Devnet Proof Script ===\n");

  // --- Setup ---
  const connection = new Connection(DEVNET_URL, "confirmed");
  const authority = loadKeypair();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance:   ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.error("ERROR: Insufficient balance. Need at least 0.1 SOL on devnet.");
    console.error("Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  const txSigs: { step: string; sig: string }[] = [];

  try {
    // --- Step 1: Create SSS-1 Stablecoin ---
    console.log("Step 1: Creating SSS-1 stablecoin...");
    const { stablecoin, mintKeypair, txSig: createSig } =
      await SolanaStablecoin.create(
        connection,
        {
          name: "SSS Devnet Proof",
          symbol: "SSSD",
          uri: "https://raw.githubusercontent.com/praneethg/solana-stablecoin-standard/main/assets/metadata.json",
          decimals: 6,
          preset: Preset.SSS_1,
          authority,
        },
        SSS_TOKEN_PROGRAM_ID,
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );

    txSigs.push({ step: "1. Create SSS-1 stablecoin", sig: createSig });
    console.log(`   Mint:  ${mintKeypair.publicKey.toBase58()}`);
    console.log(`   Tx:    ${txLink(createSig)}`);
    await sleep(2000);

    // --- Step 2: Assign Minter role ---
    console.log("\nStep 2: Assigning Minter role to authority...");
    const minterSig = await stablecoin.updateRoles({
      roleType: RoleType.Minter,
      assignee: authority.publicKey,
      isActive: true,
    });
    txSigs.push({ step: "2. Assign Minter role", sig: minterSig });
    console.log(`   Tx:    ${txLink(minterSig)}`);
    await sleep(2000);

    // --- Step 3: Assign Burner role ---
    console.log("\nStep 3: Assigning Burner role to authority...");
    const burnerSig = await stablecoin.updateRoles({
      roleType: RoleType.Burner,
      assignee: authority.publicKey,
      isActive: true,
    });
    txSigs.push({ step: "3. Assign Burner role", sig: burnerSig });
    console.log(`   Tx:    ${txLink(burnerSig)}`);
    await sleep(2000);

    // --- Step 4: Set minter quota ---
    console.log("\nStep 4: Setting minter quota (10,000 tokens)...");
    const [minterRolePda] = findRolePda(
      stablecoin.configPda,
      RoleType.Minter,
      authority.publicKey,
      SSS_TOKEN_PROGRAM_ID
    );
    const quotaSig = await stablecoin.updateMinterQuota({
      minterRole: minterRolePda,
      newQuota: new BN(10_000_000_000), // 10,000 tokens (6 decimals)
    });
    txSigs.push({ step: "4. Set minter quota", sig: quotaSig });
    console.log(`   Tx:    ${txLink(quotaSig)}`);
    await sleep(2000);

    // --- Step 5: Create ATA + Mint tokens ---
    console.log("\nStep 5: Minting 100 tokens...");
    const ata = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create ATA first
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      ata,
      authority.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const { Transaction } = await import("@solana/web3.js");
    const ataTx = new Transaction().add(createAtaIx);
    ataTx.feePayer = authority.publicKey;
    ataTx.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    ataTx.sign(authority);
    const ataCreateSig = await connection.sendRawTransaction(ataTx.serialize());
    await connection.confirmTransaction(ataCreateSig, "confirmed");
    txSigs.push({ step: "5a. Create ATA", sig: ataCreateSig });
    console.log(`   ATA:   ${ata.toBase58()}`);
    console.log(`   Tx:    ${txLink(ataCreateSig)}`);
    await sleep(2000);

    // Mint 100 tokens
    const mintSig = await stablecoin.mint(
      ata,
      new BN(100_000_000), // 100 tokens (6 decimals)
      authority.publicKey
    );
    txSigs.push({ step: "5b. Mint 100 tokens", sig: mintSig });
    console.log(`   Tx:    ${txLink(mintSig)}`);
    await sleep(2000);

    // --- Step 6: Burn tokens ---
    console.log("\nStep 6: Burning 25 tokens...");
    const burnSig = await stablecoin.burn(
      ata,
      new BN(25_000_000), // 25 tokens (6 decimals)
      authority.publicKey,
      authority.publicKey
    );
    txSigs.push({ step: "6. Burn 25 tokens", sig: burnSig });
    console.log(`   Tx:    ${txLink(burnSig)}`);

    // --- Summary ---
    console.log("\n=== Devnet Proof Summary ===\n");
    console.log(`Stablecoin: SSS Devnet Proof (SSSD)`);
    console.log(`Mint:       ${mintKeypair.publicKey.toBase58()}`);
    console.log(`Authority:  ${authority.publicKey.toBase58()}`);
    console.log(`Decimals:   6`);
    console.log(`Minted:     100 SSSD`);
    console.log(`Burned:     25 SSSD`);
    console.log(`Remaining:  75 SSSD\n`);

    console.log("Programs:");
    console.log(`  sss-token:         https://explorer.solana.com/address/tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz?cluster=devnet`);
    console.log(`  sss-transfer-hook: https://explorer.solana.com/address/A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB?cluster=devnet\n`);

    console.log("Transaction Signatures:");
    for (const { step, sig } of txSigs) {
      console.log(`  ${step}`);
      console.log(`    ${sig}`);
      console.log(`    ${txLink(sig)}`);
    }

    console.log("\n=== All transactions completed successfully! ===");
  } catch (err: unknown) {
    console.error("\n=== Transaction failed ===");
    console.error(err instanceof Error ? err.message : String(err));

    const errAny = err as any;
    if (
      errAny.message?.includes("realloc") ||
      errAny.message?.includes("0x7d6000010") ||
      errAny.logs?.some((l: string) => l.includes("realloc"))
    ) {
      console.error(
        "\nNOTE: This failure is likely caused by the Agave 3.0.x SIMD-0219 bug"
      );
      console.error(
        "which breaks Token-2022 metadata realloc on devnet."
      );
      console.error(
        "See: https://github.com/anza-xyz/agave/issues/9799"
      );
      console.error(
        "\nThe programs ARE deployed and verified on devnet:"
      );
      console.error(
        "  sss-token:         https://explorer.solana.com/address/tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz?cluster=devnet"
      );
      console.error(
        "  sss-transfer-hook: https://explorer.solana.com/address/A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB?cluster=devnet"
      );
    }

    // Still print any successful txs
    if (txSigs.length > 0) {
      console.log("\nCompleted transactions before failure:");
      for (const { step, sig } of txSigs) {
        console.log(`  ${step}: ${txLink(sig)}`);
      }
    }

    process.exit(1);
  }
}

main();
