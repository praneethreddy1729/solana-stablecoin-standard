import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const pauseCommand = new Command("pause")
  .description("Pause the token")
  .requiredOption("--mint <address>", "Mint address")
  .option("--pauser <address>", "Pauser pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const pauser = opts.pauser
      ? new PublicKey(opts.pauser)
      : wallet.publicKey;

    const txSig = await stablecoin.pause({ pauser });

    console.log(`Token paused`);
    console.log(`Tx: ${txSig}`);
  });

export const unpauseCommand = new Command("unpause")
  .description("Unpause the token")
  .requiredOption("--mint <address>", "Mint address")
  .option("--pauser <address>", "Pauser pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const pauser = opts.pauser
      ? new PublicKey(opts.pauser)
      : wallet.publicKey;

    const txSig = await stablecoin.unpause({ pauser });

    console.log(`Token unpaused`);
    console.log(`Tx: ${txSig}`);
  });
