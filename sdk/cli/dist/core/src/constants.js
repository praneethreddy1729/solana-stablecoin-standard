"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRY_SEED = exports.ATTESTATION_SEED = exports.EXTRA_ACCOUNT_METAS_SEED = exports.BLACKLIST_SEED = exports.ROLE_SEED = exports.CONFIG_SEED = exports.SSS_TRANSFER_HOOK_PROGRAM_ID = exports.SSS_TOKEN_PROGRAM_ID = exports.TOKEN_2022_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
Object.defineProperty(exports, "TOKEN_2022_PROGRAM_ID", { enumerable: true, get: function () { return spl_token_1.TOKEN_2022_PROGRAM_ID; } });
exports.SSS_TOKEN_PROGRAM_ID = new web3_js_1.PublicKey("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz");
exports.SSS_TRANSFER_HOOK_PROGRAM_ID = new web3_js_1.PublicKey("A7UUA9Dbn9XokzuTqMCD9ka4y7x1pQBHJERa92dGAHKB");
// PDA seeds — must match on-chain constants exactly
exports.CONFIG_SEED = Buffer.from("config");
exports.ROLE_SEED = Buffer.from("role");
exports.BLACKLIST_SEED = Buffer.from("blacklist");
exports.EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");
exports.ATTESTATION_SEED = Buffer.from("attestation");
exports.REGISTRY_SEED = Buffer.from("registry");
//# sourceMappingURL=constants.js.map