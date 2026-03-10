import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { loadStablecoin, loadWallet } from "../helpers";

export const attestReservesCommand = new Command("attest-reserves")
  .description("Submit a reserve attestation")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--reserve-amount <amount>", "Reserve amount (in base units)")
  .requiredOption("--expires-in <seconds>", "Expiration time in seconds")
  .requiredOption("--uri <uri>", "Attestation URI (proof link)")
  .option("--attestor <address>", "Attestor pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const wallet = loadWallet(opts.keypair);
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const attestor = opts.attestor
        ? new PublicKey(opts.attestor)
        : wallet.publicKey;

      const txSig = await stablecoin.attestReserves({
        reserveAmount: new BN(opts.reserveAmount),
        expiresInSeconds: new BN(opts.expiresIn),
        attestationUri: opts.uri,
        attestor,
      });

      console.log(`Reserve attestation submitted`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to attest reserves: ${(err as Error).message}`);
      process.exit(1);
    }
  });
