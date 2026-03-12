import { PublicKey } from "@solana/web3.js";
import {
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ATTESTATION_SEED,
  REGISTRY_SEED,
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./constants";

/**
 * Derive the StablecoinConfig PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

/**
 * Derive the RoleAssignment PDA for a given config, role type, and assignee.
 * @param config - The StablecoinConfig PDA.
 * @param roleType - Numeric role type (see {@link RoleType}).
 * @param assignee - The wallet assigned the role.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findRolePda(
  config: PublicKey,
  roleType: number,
  assignee: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([roleType]), assignee.toBuffer()],
    programId
  );
}

/**
 * Derive the BlacklistEntry PDA for a given mint and user (on the hook program).
 * @param mint - The Token-2022 mint public key.
 * @param user - The wallet to check/blacklist.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findBlacklistPda(
  mint: PublicKey,
  user: PublicKey,
  hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), user.toBuffer()],
    hookProgramId
  );
}

/**
 * Derive the ExtraAccountMetas PDA for the transfer hook.
 * @param mint - The Token-2022 mint public key.
 * @param hookProgramId - SSS transfer hook program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findExtraAccountMetasPda(
  mint: PublicKey,
  hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId
  );
}

/**
 * Derive the ReserveAttestation PDA for a given config.
 * @param config - The StablecoinConfig PDA.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findAttestationPda(
  config: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ATTESTATION_SEED, config.toBuffer()],
    programId
  );
}

/**
 * Derive the RegistryEntry PDA for a given mint.
 * @param mint - The Token-2022 mint public key.
 * @param programId - SSS token program ID.
 * @returns Tuple of [PDA PublicKey, bump seed].
 */
export function findRegistryEntryPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, mint.toBuffer()],
    programId
  );
}
