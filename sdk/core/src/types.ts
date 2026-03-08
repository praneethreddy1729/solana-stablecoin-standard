import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";

/** Must match on-chain RoleType repr(u8) */
export enum RoleType {
  Minter = 0,
  Burner = 1,
  Pauser = 2,
  Freezer = 3,
  Blacklister = 4,
  Seizer = 5,
  Attestor = 6,
}

export enum Preset {
  /** SSS-1: Basic stablecoin (mint/burn/pause/freeze, no transfer hook) */
  SSS_1 = "SSS_1",
  /** SSS-2: Full compliance (transfer hook + blacklist + permanent delegate + seize) */
  SSS_2 = "SSS_2",
  /** Custom: User specifies individual flags */
  Custom = "Custom",
}

/** Mirrors on-chain StablecoinConfig account (includes _reserved for correct serialization) */
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
  _reserved: number[];
}

/** Mirrors on-chain RoleAssignment account (includes _reserved for correct serialization) */
export interface RoleAssignment {
  config: PublicKey;
  assignee: PublicKey;
  roleType: number;
  isActive: boolean;
  minterQuota: BN;
  mintedAmount: BN;
  bump: number;
  _reserved: number[];
}

/** Mirrors on-chain BlacklistEntry account (hook program) */
export interface BlacklistEntry {
  mint: PublicKey;
  user: PublicKey;
  bump: number;
}

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  authority: Keypair;
  preset?: Preset;
  enableTransferHook?: boolean;
  enablePermanentDelegate?: boolean;
  defaultAccountFrozen?: boolean;
}

export interface MintParams {
  amount: BN;
  to: PublicKey;
  minter: PublicKey;
}

export interface BurnParams {
  amount: BN;
  from: PublicKey;
  fromAuthority: PublicKey;
  burner: PublicKey;
}

export interface FreezeThawParams {
  tokenAccount: PublicKey;
  freezer: PublicKey;
}

export interface PauseParams {
  pauser: PublicKey;
}

export interface BlacklistParams {
  user: PublicKey;
  blacklister: PublicKey;
  reason?: string;
}

export interface SeizeParams {
  from: PublicKey;
  to: PublicKey;
}

export interface UpdateRolesParams {
  roleType: RoleType;
  assignee: PublicKey;
  isActive: boolean;
}

export interface UpdateMinterQuotaParams {
  minterRole: PublicKey;
  newQuota: BN;
}

/** Mirrors on-chain ReserveAttestation account */
export interface ReserveAttestation {
  config: PublicKey;
  attestor: PublicKey;
  reserveAmount: BN;
  tokenSupply: BN;
  timestamp: BN;
  expiresAt: BN;
  attestationUri: string;
  isValid: boolean;
  bump: number;
}

export interface AttestReservesParams {
  reserveAmount: BN;
  expiresInSeconds: BN;
  attestationUri: string;
  attestor: PublicKey;
}

export const Presets = Preset;
