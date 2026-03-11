import { PublicKey } from "@solana/web3.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ATTESTATION_SEED,
} from "./constants";

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

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

export function findExtraAccountMetasPda(
  mint: PublicKey,
  hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId
  );
}

export function findAttestationPda(
  config: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ATTESTATION_SEED, config.toBuffer()],
    programId
  );
}
