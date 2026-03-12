import { PublicKey } from "@solana/web3.js";
/**
 * Derive the StablecoinConfig PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findConfigPda(mint: PublicKey, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the RoleAssignment PDA for a given config, role type, and assignee.
 * @param config - The StablecoinConfig PDA.
 * @param roleType - Numeric role type (see {@link RoleType}).
 * @param assignee - The wallet assigned the role.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findRolePda(config: PublicKey, roleType: number, assignee: PublicKey, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the BlacklistEntry PDA for a given mint and user (on the hook program).
 * @param mint - The Token-2022 mint public key.
 * @param user - The wallet to check/blacklist.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findBlacklistPda(mint: PublicKey, user: PublicKey, hookProgramId?: PublicKey): [PublicKey, number];
/**
 * Derive the ExtraAccountMetas PDA for the transfer hook.
 * @param mint - The Token-2022 mint public key.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findExtraAccountMetasPda(mint: PublicKey, hookProgramId?: PublicKey): [PublicKey, number];
/**
 * Derive the ReserveAttestation PDA for a given config.
 * @param config - The StablecoinConfig PDA.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findAttestationPda(config: PublicKey, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the RegistryEntry PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export declare function findRegistryEntryPda(mint: PublicKey, programId?: PublicKey): [PublicKey, number];
//# sourceMappingURL=pda.d.ts.map