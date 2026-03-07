import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const freezeCommand = new Command("freeze")
  .description("Freeze a token account")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--account <address>", "Token account to freeze")
  .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const freezer = opts.freezer
      ? new PublicKey(opts.freezer)
      : wallet.publicKey;

    const txSig = await stablecoin.freeze({
      tokenAccount: new PublicKey(opts.account),
      freezer,
    });

    console.log(`Frozen account: ${opts.account}`);
    console.log(`Tx: ${txSig}`);
  });

export const thawCommand = new Command("thaw")
  .description("Thaw a frozen token account")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--account <address>", "Token account to thaw")
  .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const freezer = opts.freezer
      ? new PublicKey(opts.freezer)
      : wallet.publicKey;

    const txSig = await stablecoin.thaw({
      tokenAccount: new PublicKey(opts.account),
      freezer,
    });

    console.log(`Thawed account: ${opts.account}`);
    console.log(`Tx: ${txSig}`);
  });
