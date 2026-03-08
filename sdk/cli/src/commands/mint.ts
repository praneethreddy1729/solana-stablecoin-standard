import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const mintCommand = new Command("mint")
  .description("Mint tokens")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--to <address>", "Recipient token account")
  .requiredOption("--amount <amount>", "Amount to mint (raw units)")
  .option("--minter <address>", "Minter pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const minter = opts.minter
      ? new PublicKey(opts.minter)
      : wallet.publicKey;

    const txSig = await stablecoin.mint(
      new PublicKey(opts.to),
      new BN(opts.amount),
      minter,
    );

    console.log(`Minted ${opts.amount} tokens to ${opts.to}`);
    console.log(`Tx: ${txSig}`);
  });
