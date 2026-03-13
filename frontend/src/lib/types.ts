import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/** Mirrors on-chain StablecoinConfig account */
export interface StablecoinConfig {
  authority: PublicKey;
  pendingAuthority: PublicKey;
  transferInitiatedAt: BN;
  mint: PublicKey;
  hookProgramId: PublicKey;
  decimals: number;
  paused: boolean;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
  defaultAccountFrozen: boolean;
  bump: number;
  treasury: PublicKey;
  pausedByAttestation: boolean;
  _reserved: number[];
}
