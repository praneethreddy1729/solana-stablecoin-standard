import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  RoleType,
  findRolePda,
  SSS_TOKEN_PROGRAM_ID,
} from "../../../core/src";
import { loadStablecoin, loadWallet } from "../helpers";

export const mintersCommand = new Command("minters")
  .description("Manage minter roles");

mintersCommand
  .command("list")
  .description("List all minter role accounts")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const stablecoin = await loadStablecoin(opts.mint, opts);

    const accounts = await stablecoin.program.account.roleAssignment.all([
      {
        memcmp: {
          offset: 8,
          bytes: stablecoin.configPda.toBase58(),
        },
      },
    ]);

    const minters = accounts.filter(
      (a: any) => a.account.roleType === RoleType.Minter
    );

    if (minters.length === 0) {
      console.log("No minters found.");
      return;
    }

    console.log("=== Minters ===");
    for (const m of minters) {
      const acct = m.account as any;
      console.log(`  ${acct.assignee.toBase58()}`);
      console.log(`    Active: ${acct.isActive}`);
      console.log(`    Quota:  ${acct.minterQuota.toString()}`);
      console.log(`    Minted: ${acct.mintedAmount.toString()}`);
    }
  });

mintersCommand
  .command("add")
  .description("Add a minter role for an address")
  .argument("<address>", "Address to grant minter role")
  .requiredOption("--mint <address>", "Mint address")
  .option("--quota <amount>", "Set minter quota")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address: string, opts) => {
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const assignee = new PublicKey(address);

    const txSig = await stablecoin.updateRoles({
      roleType: RoleType.Minter,
      assignee,
      isActive: true,
    });
    console.log(`Added minter role for ${address}`);
    console.log(`Tx: ${txSig}`);

    if (opts.quota) {
      const [minterRole] = findRolePda(
        stablecoin.configPda,
        RoleType.Minter,
        assignee,
        SSS_TOKEN_PROGRAM_ID
      );
      const txSig2 = await stablecoin.updateMinterQuota({
        minterRole,
        newQuota: new BN(opts.quota),
      });
      console.log(`Set quota to ${opts.quota}`);
      console.log(`Tx: ${txSig2}`);
    }
  });

mintersCommand
  .command("remove")
  .description("Remove a minter role for an address")
  .argument("<address>", "Address to revoke minter role from")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address: string, opts) => {
    const stablecoin = await loadStablecoin(opts.mint, opts);

    const txSig = await stablecoin.updateRoles({
      roleType: RoleType.Minter,
      assignee: new PublicKey(address),
      isActive: false,
    });
    console.log(`Removed minter role for ${address}`);
    console.log(`Tx: ${txSig}`);
  });
