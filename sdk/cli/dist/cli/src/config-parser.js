"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseConfigFile = parseConfigFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parse a JSON or TOML config file for stablecoin initialization.
 * Supports .json and .toml extensions.
 */
function parseConfigFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Config file not found: ${resolved}`);
    }
    const ext = path.extname(resolved).toLowerCase();
    const raw = fs.readFileSync(resolved, "utf-8");
    if (ext === ".json") {
        return parseJson(raw);
    }
    else if (ext === ".toml") {
        return parseToml(raw);
    }
    else {
        // Try JSON first, then TOML
        try {
            return parseJson(raw);
        }
        catch {
            return parseToml(raw);
        }
    }
}
function parseJson(raw) {
    const parsed = JSON.parse(raw);
    return validateConfig(parsed);
}
/**
 * Minimal TOML parser — handles flat key=value pairs, strings, numbers, booleans.
 * For complex TOML, users should use JSON instead.
 */
function parseToml(raw) {
    const result = {};
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("["))
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Remove inline comments
        const commentIdx = value.indexOf("#");
        if (commentIdx > 0 && value[commentIdx - 1] === " ") {
            value = value.slice(0, commentIdx).trim();
        }
        // Parse value type
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            result[key] = value.slice(1, -1);
        }
        else if (value === "true") {
            result[key] = true;
        }
        else if (value === "false") {
            result[key] = false;
        }
        else if (!isNaN(Number(value))) {
            result[key] = Number(value);
        }
        else {
            result[key] = value;
        }
    }
    return validateConfig(result);
}
function validateConfig(obj) {
    if (!obj.name || typeof obj.name !== "string") {
        throw new Error("Config must include 'name' (string)");
    }
    if (!obj.symbol || typeof obj.symbol !== "string") {
        throw new Error("Config must include 'symbol' (string)");
    }
    return {
        name: obj.name,
        symbol: obj.symbol,
        uri: obj.uri ?? "",
        decimals: typeof obj.decimals === "number" ? obj.decimals : 6,
        preset: obj.preset,
        enableTransferHook: obj.enableTransferHook,
        enablePermanentDelegate: obj.enablePermanentDelegate,
        defaultAccountFrozen: obj.defaultAccountFrozen,
    };
}
//# sourceMappingURL=config-parser.js.map