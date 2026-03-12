import { Command } from "commander";
import { SolanaStablecoin, Preset, Presets } from "../../../core/src";
import { loadKeypair, getConnection } from "../helpers";
import { parseConfigFile } from "../config-parser";

const PRESET_MAP: Record<string, Preset> = {
  SSS_1: Preset.SSS_1,
  "SSS-1": Preset.SSS_1,
  SSS_2: Preset.SSS_2,
  "SSS-2": Preset.SSS_2,
  CUSTOM: Preset.Custom,
};

export const initCommand = new Command("init")
  .description("Create a new stablecoin")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <n>", "Decimals", "6")
  .option("--preset <preset>", "Preset: SSS-1, SSS-2, or CUSTOM", "SSS_1")
  .option("--custom <path>", "Custom config file (JSON or TOML)")
  .option("--transfer-hook", "Enable transfer hook (CUSTOM preset)")
  .option("--permanent-delegate", "Enable permanent delegate (CUSTOM preset)")
  .option("--default-frozen", "Default account state frozen (CUSTOM preset)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const connection = getConnection(opts.rpcUrl);
      const authority = loadKeypair(opts.keypair);

      let name: string;
      let symbol: string;
      let uri: string;
      let decimals: number;
      let preset: Preset;
      let enableTransferHook: boolean;
      let enablePermanentDelegate: boolean;
      let defaultAccountFrozen: boolean;

      if (opts.custom) {
        const config = parseConfigFile(opts.custom);
        name = config.name;
        symbol = config.symbol;
        uri = config.uri ?? "";
        decimals = config.decimals ?? 6;
        const presetStr = config.preset?.toUpperCase() ?? "SSS_1";
        preset = PRESET_MAP[presetStr] ?? Preset.Custom;
        enableTransferHook = config.enableTransferHook ?? false;
        enablePermanentDelegate = config.enablePermanentDelegate ?? false;
        defaultAccountFrozen = config.defaultAccountFrozen ?? false;
      } else {
        const resolvedPreset = PRESET_MAP[opts.preset?.toUpperCase()] ?? Preset.SSS_1;
        const isCustomPreset = resolvedPreset === Preset.Custom;

        if (isCustomPreset && (!opts.name || !opts.symbol)) {
          console.error("Error: --name and --symbol are required for CUSTOM preset (or use --custom <config-file>)");
          process.exit(1);
        }

        // Apply sensible defaults for named presets when name/symbol not provided
        const presetDefaults: Record<string, { name: string; symbol: string }> = {
          [Preset.SSS_1]: { name: "SSS-1 Stablecoin", symbol: "SSS1" },
          [Preset.SSS_2]: { name: "SSS-2 Stablecoin", symbol: "SSS2" },
        };
        const defaults = presetDefaults[resolvedPreset as string] ?? { name: "", symbol: "" };

        name = opts.name ?? defaults.name;
        symbol = opts.symbol ?? defaults.symbol;
        uri = opts.uri;
        decimals = parseInt(opts.decimals, 10);
        preset = resolvedPreset;
        enableTransferHook = opts.transferHook ?? false;
        enablePermanentDelegate = opts.permanentDelegate ?? false;
        defaultAccountFrozen = opts.defaultFrozen ?? false;
      }

      console.log(`Creating stablecoin: ${name} (${symbol})`);
      console.log(`Preset: ${preset}`);

      const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(
        connection,
        {
          name,
          symbol,
          uri,
          decimals,
          preset,
          enableTransferHook,
          enablePermanentDelegate,
          defaultAccountFrozen,
          authority,
        }
      );

      console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);
      console.log(`Config PDA: ${stablecoin.configPda.toBase58()}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to initialize stablecoin: ${(err as Error).message}`);
      process.exit(1);
    }
  });
