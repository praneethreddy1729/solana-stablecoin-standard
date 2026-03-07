import { Command } from "commander";
import { SolanaStablecoin, Preset } from "../../../core/src";
import { loadWallet, getConnection } from "../helpers";

const PRESET_MAP: Record<string, Preset> = {
  SSS_1: Preset.SSS_1,
  "SSS-1": Preset.SSS_1,
  SSS_2: Preset.SSS_2,
  "SSS-2": Preset.SSS_2,
  CUSTOM: Preset.Custom,
};

export const initCommand = new Command("init")
  .description("Create a new stablecoin")
  .requiredOption("--name <name>", "Token name")
  .requiredOption("--symbol <symbol>", "Token symbol")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <n>", "Decimals", "6")
  .option("--preset <preset>", "Preset: SSS-1, SSS-2, or CUSTOM", "SSS_1")
  .option("--transfer-hook", "Enable transfer hook (CUSTOM preset)")
  .option("--permanent-delegate", "Enable permanent delegate (CUSTOM preset)")
  .option("--default-frozen", "Default account state frozen (CUSTOM preset)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const connection = getConnection(opts.rpcUrl);
    const wallet = loadWallet(opts.keypair);

    const preset = PRESET_MAP[opts.preset.toUpperCase()] ?? Preset.SSS_1;

    console.log(`Creating stablecoin: ${opts.name} (${opts.symbol})`);
    console.log(`Preset: ${preset}`);

    const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
      connection,
      wallet,
      {
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals, 10),
        preset,
        enableTransferHook: opts.transferHook ?? false,
        enablePermanentDelegate: opts.permanentDelegate ?? false,
        defaultAccountFrozen: opts.defaultFrozen ?? false,
      }
    );

    console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`Config PDA: ${stablecoin.configPda.toBase58()}`);
    console.log(`Tx: ${txSig}`);
  });
