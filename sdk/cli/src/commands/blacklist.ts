import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const blacklistCommand = new Command("blacklist")
  .description("Manage address blacklist");

blacklistCommand
  .command("add")
  .description("Add an address to the blacklist")
  .argument("<address>", "User wallet address to blacklist")
  .requiredOption("--mint <address>", "Mint address")
  .option("--reason <reason>", "Reason for blacklisting (e.g. 'OFAC match')")
  .option("--blacklister <address>", "Blacklister pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address: string, opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const blacklister = opts.blacklister
      ? new PublicKey(opts.blacklister)
      : wallet.publicKey;
    const user = new PublicKey(address);

    const txSig = await stablecoin.compliance.blacklistAdd(
      user,
      blacklister,
      opts.reason,
    );
    console.log(`Added ${address} to blacklist`);
    if (opts.reason) {
      console.log(`Reason: ${opts.reason}`);
    }
    console.log(`Tx: ${txSig}`);
  });

blacklistCommand
  .command("remove")
  .description("Remove an address from the blacklist")
  .argument("<address>", "User wallet address to unblacklist")
  .requiredOption("--mint <address>", "Mint address")
  .option("--blacklister <address>", "Blacklister pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address: string, opts) => {
    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const blacklister = opts.blacklister
      ? new PublicKey(opts.blacklister)
      : wallet.publicKey;
    const user = new PublicKey(address);

    const txSig = await stablecoin.compliance.blacklistRemove(
      user,
      blacklister,
    );
    console.log(`Removed ${address} from blacklist`);
    console.log(`Tx: ${txSig}`);
  });

blacklistCommand
  .command("check")
  .description("Check if an address is blacklisted")
  .argument("<address>", "User wallet address to check")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address: string, opts) => {
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const user = new PublicKey(address);

    try {
      const isBlacklisted = await stablecoin.compliance.isBlacklisted(user);
      if (isBlacklisted) {
        console.log(`${address} IS blacklisted`);
      } else {
        console.log(`${address} is NOT blacklisted`);
      }
    } catch {
      // If the account doesn't exist, the user is not blacklisted
      console.log(`${address} is NOT blacklisted`);
    }
  });
