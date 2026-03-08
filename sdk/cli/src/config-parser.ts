import * as fs from "fs";
import * as path from "path";

export interface CustomConfig {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  preset?: string;
  enableTransferHook?: boolean;
  enablePermanentDelegate?: boolean;
  defaultAccountFrozen?: boolean;
}

/**
 * Parse a JSON or TOML config file for stablecoin initialization.
 * Supports .json and .toml extensions.
 */
export function parseConfigFile(filePath: string): CustomConfig {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  const raw = fs.readFileSync(resolved, "utf-8");

  if (ext === ".json") {
    return parseJson(raw);
  } else if (ext === ".toml") {
    return parseToml(raw);
  } else {
    // Try JSON first, then TOML
    try {
      return parseJson(raw);
    } catch {
      return parseToml(raw);
    }
  }
}

function parseJson(raw: string): CustomConfig {
  const parsed = JSON.parse(raw);
  return validateConfig(parsed);
}

/**
 * Minimal TOML parser — handles flat key=value pairs, strings, numbers, booleans.
 * For complex TOML, users should use JSON instead.
 */
function parseToml(raw: string): CustomConfig {
  const result: Record<string, string | number | boolean> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value: string | number | boolean = trimmed.slice(eqIdx + 1).trim();

    // Remove inline comments
    const commentIdx = value.indexOf("#");
    if (commentIdx > 0 && value[commentIdx - 1] === " ") {
      value = value.slice(0, commentIdx).trim();
    }

    // Parse value type
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      result[key] = value.slice(1, -1);
    } else if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else if (!isNaN(Number(value))) {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }

  return validateConfig(result);
}

function validateConfig(obj: Record<string, unknown>): CustomConfig {
  if (!obj.name || typeof obj.name !== "string") {
    throw new Error("Config must include 'name' (string)");
  }
  if (!obj.symbol || typeof obj.symbol !== "string") {
    throw new Error("Config must include 'symbol' (string)");
  }

  return {
    name: obj.name as string,
    symbol: obj.symbol as string,
    uri: (obj.uri as string) ?? "",
    decimals: typeof obj.decimals === "number" ? obj.decimals : 6,
    preset: obj.preset as string | undefined,
    enableTransferHook: obj.enableTransferHook as boolean | undefined,
    enablePermanentDelegate: obj.enablePermanentDelegate as boolean | undefined,
    defaultAccountFrozen: obj.defaultAccountFrozen as boolean | undefined,
  };
}
