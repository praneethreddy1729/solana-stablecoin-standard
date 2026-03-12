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
exports.loadKeypair = loadKeypair;
exports.loadWallet = loadWallet;
exports.getConnection = getConnection;
exports.loadStablecoin = loadStablecoin;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const src_1 = require("../../core/src");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function loadKeypair(keypairPath) {
    const resolved = keypairPath ||
        process.env.ANCHOR_WALLET ||
        path.join(os.homedir(), ".config", "solana", "id.json");
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
        return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(raw));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: Failed to load keypair from ${resolved}: ${msg}`);
        process.exit(1);
    }
}
function loadWallet(keypairPath) {
    return new anchor_1.Wallet(loadKeypair(keypairPath));
}
function getConnection(rpcUrl) {
    const url = rpcUrl ||
        process.env.ANCHOR_PROVIDER_URL ||
        "http://localhost:8899";
    return new web3_js_1.Connection(url, "confirmed");
}
async function loadStablecoin(mintAddress, opts) {
    const connection = getConnection(opts.rpcUrl);
    const wallet = loadWallet(opts.keypair);
    const mint = new web3_js_1.PublicKey(mintAddress);
    return src_1.SolanaStablecoin.load(connection, wallet, mint);
}
//# sourceMappingURL=helpers.js.map