"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findConfigPda = findConfigPda;
exports.findRolePda = findRolePda;
exports.findBlacklistPda = findBlacklistPda;
exports.findExtraAccountMetasPda = findExtraAccountMetasPda;
exports.findAttestationPda = findAttestationPda;
exports.findRegistryEntryPda = findRegistryEntryPda;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
/**
 * Derive the StablecoinConfig PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findConfigPda(mint, programId = constants_1.SSS_TOKEN_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.CONFIG_SEED, mint.toBuffer()], programId);
}
/**
 * Derive the RoleAssignment PDA for a given config, role type, and assignee.
 * @param config - The StablecoinConfig PDA.
 * @param roleType - Numeric role type (see {@link RoleType}).
 * @param assignee - The wallet assigned the role.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findRolePda(config, roleType, assignee, programId = constants_1.SSS_TOKEN_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, config.toBuffer(), Buffer.from([roleType]), assignee.toBuffer()], programId);
}
/**
 * Derive the BlacklistEntry PDA for a given mint and user (on the hook program).
 * @param mint - The Token-2022 mint public key.
 * @param user - The wallet to check/blacklist.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findBlacklistPda(mint, user, hookProgramId = constants_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.BLACKLIST_SEED, mint.toBuffer(), user.toBuffer()], hookProgramId);
}
/**
 * Derive the ExtraAccountMetas PDA for the transfer hook.
 * @param mint - The Token-2022 mint public key.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findExtraAccountMetasPda(mint, hookProgramId = constants_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()], hookProgramId);
}
/**
 * Derive the ReserveAttestation PDA for a given config.
 * @param config - The StablecoinConfig PDA.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findAttestationPda(config, programId = constants_1.SSS_TOKEN_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.ATTESTATION_SEED, config.toBuffer()], programId);
}
/**
 * Derive the RegistryEntry PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
function findRegistryEntryPda(mint, programId = constants_1.SSS_TOKEN_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.REGISTRY_SEED, mint.toBuffer()], programId);
}
//# sourceMappingURL=pda.js.map