import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
  ParsedAccountData,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import BN from "bn.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./constants";
import {
  findConfigPda,
  findRolePda,
  findBlacklistPda,
  findExtraAccountMetasPda,
  findAttestationPda,
  findRegistryEntryPda,
} from "./pda";
import {
  RoleType,
  Preset,
  StablecoinConfig,
  ReserveAttestation,
  RegistryEntry,
  InitializeParams,
  FreezeThawParams,
  PauseParams,
  UpdateRolesParams,
  UpdateMinterQuotaParams,
  AttestReservesParams,
} from "./types";
import { parseSSSError } from "./errors";

import sssTokenIdl from "./idl/sss_token.json";
import sssTransferHookIdl from "./idl/sss_transfer_hook.json";
import { SssToken } from "./types/sss_token";
import { SssTransferHook } from "./types/sss_transfer_hook";
import { OraclePriceGuard, PYTH_FEED_IDS } from "./oracle";
import type { PriceGuardConfig } from "./oracle";

async function wrapError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const parsed = parseSSSError(err);
    if (parsed) {
      throw new Error(`${operation} failed: ${parsed.name} — ${parsed.msg}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${operation} failed: ${msg}`);
  }
}

function requirePositiveAmount(amount: BN, label: string): void {
  // Use toString() comparison to handle cross-package BN instances
  const val = new BN(amount.toString());
  if (val.lten(0)) {
    throw new Error(`${label} must be greater than zero`);
  }
}

/**
 * High-level SDK for the Solana Stablecoin Standard (SSS).
 *
 * Supports SSS-1 (basic mint/burn/pause/freeze) and SSS-2 (full compliance
 * with transfer hook, blacklist, permanent delegate, and seize).
 *
 * Use `SolanaStablecoin.create()` to deploy a new stablecoin or
 * `SolanaStablecoin.load()` to interact with an existing one.
 */
export class SolanaStablecoin {
  readonly program: Program<SssToken>;
  readonly hookProgram: Program<SssTransferHook>;
  readonly connection: Connection;
  readonly mintAddress: PublicKey;
  readonly configPda: PublicKey;
  readonly configBump: number;
  readonly programId: PublicKey;
  readonly hookProgramId: PublicKey;

  public oracle: OraclePriceGuard | null = null;

  /** Compliance operations (SSS-2 only): blacklist, seize. Requires Blacklister/Seizer roles. */
  public compliance: {
    blacklistAdd: (address: PublicKey, reasonOrBlacklister?: string | PublicKey, reason?: string) => Promise<TransactionSignature>;
    blacklistRemove: (address: PublicKey, blacklister: PublicKey) => Promise<TransactionSignature>;
    seize: (frozenAccount: PublicKey, treasury: PublicKey) => Promise<TransactionSignature>;
    isBlacklisted: (user: PublicKey) => Promise<boolean>;
  };

  private constructor(
    connection: Connection,
    mint: PublicKey,
    programId: PublicKey,
    hookProgramId: PublicKey,
    program: Program<SssToken>,
    hookProgram: Program<SssTransferHook>
  ) {
    this.connection = connection;
    this.mintAddress = mint;
    this.programId = programId;
    this.hookProgramId = hookProgramId;
    this.program = program;
    this.hookProgram = hookProgram;

    const [configPda, configBump] = findConfigPda(mint, programId);
    this.configPda = configPda;
    this.configBump = configBump;

    this.compliance = {
      blacklistAdd: this._blacklistAdd.bind(this),
      blacklistRemove: this._blacklistRemove.bind(this),
      seize: this._seize.bind(this),
      isBlacklisted: this._isBlacklisted.bind(this),
    };
  }

  private static buildPrograms(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey,
    hookProgramId: PublicKey
  ): { program: Program<SssToken>; hookProgram: Program<SssTransferHook> } {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    const program = new Program<SssToken>(sssTokenIdl as any, provider);
    const hookProgram = new Program<SssTransferHook>(sssTransferHookIdl as any, provider);
    return { program, hookProgram };
  }

  /**
   * Deploy a new stablecoin: creates the Token-2022 mint, config PDA, and registry entry.
   * For SSS-2 tokens, also initializes the transfer hook's ExtraAccountMetas PDA.
   * Returns the SDK instance, mint keypair, and transaction signature(s).
   */
  static async create(
    connection: Connection,
    params: InitializeParams,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
  ): Promise<{
    stablecoin: SolanaStablecoin;
    mintKeypair: Keypair;
    txSig: TransactionSignature;
    hookTxSig: TransactionSignature | null;
  }> {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error("initialize: name is required");
    }
    if (!params.symbol || params.symbol.trim().length === 0) {
      throw new Error("initialize: symbol is required");
    }
    if (params.decimals < 0 || params.decimals > 18) {
      throw new Error("initialize: decimals must be between 0 and 18");
    }

    // Duck-type check: Keypair has secretKey, Wallet has signTransaction
    const wallet = "secretKey" in params.authority
      ? new Wallet(params.authority as Keypair)
      : (params.authority as Wallet);

    const { program, hookProgram } = SolanaStablecoin.buildPrograms(
      connection,
      wallet,
      programId,
      hookProgramId
    );

    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey, programId);

    let enableTransferHook = params.enableTransferHook ?? false;
    let enablePermanentDelegate = params.enablePermanentDelegate ?? false;
    let defaultAccountFrozen = params.defaultAccountFrozen ?? false;

    if (params.preset === Preset.SSS_1) {
      enableTransferHook = false;
      enablePermanentDelegate = false;
      defaultAccountFrozen = false;
    } else if (params.preset === Preset.SSS_2) {
      enableTransferHook = true;
      enablePermanentDelegate = true;
      defaultAccountFrozen = false;
    }

    // Allow explicit extensions to override preset defaults
    if (params.extensions) {
      if (params.extensions.permanentDelegate !== undefined) enablePermanentDelegate = params.extensions.permanentDelegate;
      if (params.extensions.transferHook !== undefined) enableTransferHook = params.extensions.transferHook;
      if (params.extensions.defaultAccountFrozen !== undefined) defaultAccountFrozen = params.extensions.defaultAccountFrozen;
    }

    const [registryEntry] = findRegistryEntryPda(mintKeypair.publicKey, programId);

    const accounts = {
      authority: wallet.publicKey,
      config: configPda,
      mint: mintKeypair.publicKey,
      registryEntry,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      hookProgram: enableTransferHook ? hookProgramId : null,
    };

    // Cast required: Anchor's strict typings don't accept null for optional accounts
    // (hookProgram is null when transfer hook is disabled). Runtime behaviour is correct —
    // the on-chain program handles a null hookProgram via Option<Pubkey>.
    const txSig = await wrapError("initialize", () =>
      program.methods
        .initialize({
          name: params.name,
          symbol: params.symbol,
          uri: params.uri ?? "",
          decimals: params.decimals,
          enableTransferHook,
          enablePermanentDelegate,
          defaultAccountFrozen,
          treasury: params.treasury ?? PublicKey.default,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .accountsStrict(accounts as any)
        .signers([mintKeypair])
        .rpc()
    );

    // For SSS-2 tokens with transfer hook enabled, automatically initialize
    // the ExtraAccountMetas PDA on the hook program. Without this, transfers
    // will fail because the hook's extra account metas aren't set up.
    let hookTxSig: TransactionSignature | null = null;
    if (enableTransferHook) {
      const [extraAccountMetasPda] = findExtraAccountMetasPda(
        mintKeypair.publicKey,
        hookProgramId
      );

      hookTxSig = await wrapError("initializeExtraAccountMetas", () =>
        hookProgram.methods
          .initializeExtraAccountMetas()
          .accountsStrict({
            payer: wallet.publicKey,
            extraAccountMetas: extraAccountMetasPda,
            mint: mintKeypair.publicKey,
            config: configPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc()
      );
    }

    const stablecoin = new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      programId,
      hookProgramId,
      program,
      hookProgram
    );

    return { stablecoin, mintKeypair, txSig, hookTxSig };
  }

  /** Load an existing stablecoin by mint address. Call `getConfig()` to verify it exists on-chain. */
  static async load(
    connection: Connection,
    wallet: Wallet,
    mintAddress: PublicKey,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
  ): Promise<SolanaStablecoin> {
    const { program, hookProgram } = SolanaStablecoin.buildPrograms(
      connection,
      wallet,
      programId,
      hookProgramId
    );

    return new SolanaStablecoin(
      connection,
      mintAddress,
      programId,
      hookProgramId,
      program,
      hookProgram
    );
  }

  async initializeHookExtraAccountMetas(): Promise<TransactionSignature> {
    const [extraAccountMetasPda] = findExtraAccountMetasPda(
      this.mintAddress,
      this.hookProgramId
    );

    const provider = this.hookProgram.provider as AnchorProvider;

    return wrapError("initializeExtraAccountMetas", () =>
      this.hookProgram.methods
        .initializeExtraAccountMetas()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          extraAccountMetas: extraAccountMetasPda,
          mint: this.mintAddress,
          config: this.configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    );
  }

  async getTotalSupply(): Promise<bigint> {
    try {
      const mintInfo = await getMint(
        this.connection,
        this.mintAddress,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      return mintInfo.supply;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`getTotalSupply failed for mint ${this.mintAddress.toBase58()}: ${msg}`);
    }
  }

  async getConfig(): Promise<StablecoinConfig> {
    try {
      return (await this.program.account.stablecoinConfig.fetch(
        this.configPda
      )) as unknown as StablecoinConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `getConfig failed: config PDA ${this.configPda.toBase58()} not found. ` +
        `Was this mint initialized via SSS? ${msg}`
      );
    }
  }

  async mint(params: { recipient: PublicKey; amount: BN | number; minter: PublicKey }): Promise<TransactionSignature>;
  async mint(to: PublicKey, amount: BN, minter: PublicKey): Promise<TransactionSignature>;
  async mint(
    toOrParams: PublicKey | { recipient: PublicKey; amount: BN | number; minter: PublicKey },
    amount?: BN,
    minter?: PublicKey,
  ): Promise<TransactionSignature> {
    let to: PublicKey;
    let mintAmount: BN;
    let minterKey: PublicKey;

    // Duck-type: PublicKey has toBase58(), object params have .recipient
    const isPositional = typeof (toOrParams as PublicKey).toBase58 === "function" && !("recipient" in toOrParams);
    if (isPositional) {
      if (!amount) throw new Error("mint: amount is required");
      if (!minter) throw new Error("mint: minter is required");
      to = toOrParams as PublicKey;
      mintAmount = amount;
      minterKey = minter;
    } else {
      const p = toOrParams as { recipient: PublicKey; amount: BN | number; minter: PublicKey };
      to = p.recipient;
      mintAmount = typeof p.amount === "number" ? new BN(p.amount) : new BN(p.amount.toString());
      minterKey = p.minter;
    }

    requirePositiveAmount(mintAmount, "mint amount");

    const [minterRole] = findRolePda(
      this.configPda,
      RoleType.Minter,
      minterKey,
      this.programId
    );

    return wrapError("mint", () =>
      this.program.methods
        .mint(mintAmount)
        .accountsStrict({
          minter: minterKey,
          config: this.configPda,
          minterRole,
          mint: this.mintAddress,
          to,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async burn(from: PublicKey, amount: BN, burner: PublicKey, fromAuthority?: PublicKey): Promise<TransactionSignature> {
    requirePositiveAmount(amount, "burn amount");

    const [burnerRole] = findRolePda(
      this.configPda,
      RoleType.Burner,
      burner,
      this.programId
    );

    return wrapError("burn", () =>
      this.program.methods
        .burn(amount)
        .accountsStrict({
          burner,
          config: this.configPda,
          burnerRole,
          mint: this.mintAddress,
          from,
          fromAuthority: fromAuthority ?? burner,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async freeze(params: FreezeThawParams): Promise<TransactionSignature> {
    const [freezerRole] = findRolePda(
      this.configPda,
      RoleType.Freezer,
      params.freezer,
      this.programId
    );

    return wrapError("freeze", () =>
      this.program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: params.freezer,
          config: this.configPda,
          freezerRole,
          mint: this.mintAddress,
          tokenAccount: params.tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async thaw(params: FreezeThawParams): Promise<TransactionSignature> {
    const [freezerRole] = findRolePda(
      this.configPda,
      RoleType.Freezer,
      params.freezer,
      this.programId
    );

    return wrapError("thaw", () =>
      this.program.methods
        .thawAccount()
        .accountsStrict({
          freezer: params.freezer,
          config: this.configPda,
          freezerRole,
          mint: this.mintAddress,
          tokenAccount: params.tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async pause(params: PauseParams): Promise<TransactionSignature> {
    const [pauserRole] = findRolePda(
      this.configPda,
      RoleType.Pauser,
      params.pauser,
      this.programId
    );

    return wrapError("pause", () =>
      this.program.methods
        .pause()
        .accountsStrict({
          pauser: params.pauser,
          config: this.configPda,
          pauserRole,
        })
        .rpc()
    );
  }

  async unpause(params: PauseParams): Promise<TransactionSignature> {
    const [pauserRole] = findRolePda(
      this.configPda,
      RoleType.Pauser,
      params.pauser,
      this.programId
    );

    return wrapError("unpause", () =>
      this.program.methods
        .unpause()
        .accountsStrict({
          pauser: params.pauser,
          config: this.configPda,
          pauserRole,
        })
        .rpc()
    );
  }

  async updateRoles(params: UpdateRolesParams): Promise<TransactionSignature> {
    const [rolePda] = findRolePda(
      this.configPda,
      params.roleType,
      params.assignee,
      this.programId
    );
    const provider = this.program.provider as AnchorProvider;

    return wrapError("updateRoles", () =>
      this.program.methods
        .updateRoles(params.roleType, params.assignee, params.isActive)
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
          role: rolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    );
  }

  async updateMinterQuota(
    params: UpdateMinterQuotaParams
  ): Promise<TransactionSignature> {
    if (params.newQuota === undefined || params.newQuota === null) {
      throw new Error("minter quota is required");
    }
    const provider = this.program.provider as AnchorProvider;

    return wrapError("updateMinterQuota", () =>
      this.program.methods
        .updateMinter(params.newQuota)
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
          minterRole: params.minterRole,
        })
        .rpc()
    );
  }

  async transferAuthority(
    newAuthority: PublicKey
  ): Promise<TransactionSignature> {
    if (newAuthority.equals(PublicKey.default)) {
      throw new Error("transferAuthority: newAuthority cannot be the default/zero public key");
    }
    const provider = this.program.provider as AnchorProvider;

    return wrapError("transferAuthority", () =>
      this.program.methods
        .transferAuthority(newAuthority)
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
        })
        .rpc()
    );
  }

  async acceptAuthority(): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return wrapError("acceptAuthority", () =>
      this.program.methods
        .acceptAuthority()
        .accountsStrict({
          newAuthority: provider.wallet.publicKey,
          config: this.configPda,
        })
        .rpc()
    );
  }

  async cancelAuthorityTransfer(): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return wrapError("cancelAuthorityTransfer", () =>
      this.program.methods
        .cancelAuthorityTransfer()
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
        })
        .rpc()
    );
  }

  async updateTreasury(newTreasury: PublicKey): Promise<TransactionSignature> {
    if (newTreasury.equals(PublicKey.default)) {
      throw new Error("updateTreasury: newTreasury cannot be the default/zero public key");
    }
    const provider = this.program.provider as AnchorProvider;

    return wrapError("updateTreasury", () =>
      this.program.methods
        .updateTreasury(newTreasury)
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
        })
        .rpc()
    );
  }

  attachOracleGuard(
    config: Partial<PriceGuardConfig> & { pythFeed: string }
  ): void {
    // Resolve feed alias to full hex ID if it matches a known alias
    const resolvedFeed =
      (PYTH_FEED_IDS as Record<string, string>)[config.pythFeed] ??
      config.pythFeed;

    this.oracle = new OraclePriceGuard({
      targetPrice: 1.0,
      maxDeviationBps: 200,
      maxStalenessSecs: 60,
      circuitBreakerThreshold: 3,
      ...config,
      pythFeed: resolvedFeed,
    });
  }

  // --- Compliance sub-object methods (SSS-2) ---

  private async _blacklistAdd(
    address: PublicKey,
    reasonOrBlacklister?: string | PublicKey,
    reason?: string
  ): Promise<TransactionSignature> {
    let blacklisterKey: PublicKey;
    let reasonStr: string;

    if (typeof reasonOrBlacklister === 'string') {
      // 2-arg form: blacklistAdd(address, reason) — use wallet as blacklister
      const provider = this.program.provider as AnchorProvider;
      blacklisterKey = provider.wallet.publicKey;
      reasonStr = reasonOrBlacklister;
    } else {
      // 3-arg form: blacklistAdd(address, blacklister, reason)
      const provider = this.program.provider as AnchorProvider;
      blacklisterKey = reasonOrBlacklister ?? provider.wallet.publicKey;
      reasonStr = reason ?? "";
    }

    const [blacklisterRole] = findRolePda(
      this.configPda,
      RoleType.Blacklister,
      blacklisterKey,
      this.programId
    );
    const [blacklistEntry] = findBlacklistPda(
      this.mintAddress,
      address,
      this.hookProgramId
    );

    return wrapError("blacklistAdd", () =>
      this.program.methods
        .addToBlacklist(address, reasonStr)
        .accountsStrict({
          blacklister: blacklisterKey,
          config: this.configPda,
          blacklisterRole,
          hookProgram: this.hookProgramId,
          blacklistEntry,
          mint: this.mintAddress,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    );
  }

  private async _blacklistRemove(
    address: PublicKey,
    blacklister: PublicKey
  ): Promise<TransactionSignature> {
    const [blacklisterRole] = findRolePda(
      this.configPda,
      RoleType.Blacklister,
      blacklister,
      this.programId
    );
    const [blacklistEntry] = findBlacklistPda(
      this.mintAddress,
      address,
      this.hookProgramId
    );

    return wrapError("blacklistRemove", () =>
      this.program.methods
        .removeFromBlacklist(address)
        .accountsStrict({
          blacklister,
          config: this.configPda,
          blacklisterRole,
          hookProgram: this.hookProgramId,
          blacklistEntry,
          mint: this.mintAddress,
        })
        .rpc()
    );
  }

  private async _seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;
    const [extraAccountMetasPda] = findExtraAccountMetasPda(this.mintAddress, this.hookProgramId);
    // Derive blacklist PDAs for the from/to token account owners.
    // These may not exist on-chain (non-blacklisted) but must be passed for the hook.
    const fromAccountInfo = await this.connection.getParsedAccountInfo(frozenAccount);
    const toAccountInfo = await this.connection.getParsedAccountInfo(treasury);
    const fromData = fromAccountInfo?.value?.data;
    const toData = toAccountInfo?.value?.data;
    const fromOwnerKey = new PublicKey(
      (fromData instanceof Buffer ? undefined : (fromData as ParsedAccountData)?.parsed?.info?.owner) ?? PublicKey.default
    );
    const toOwnerKey = new PublicKey(
      (toData instanceof Buffer ? undefined : (toData as ParsedAccountData)?.parsed?.info?.owner) ?? PublicKey.default
    );
    const [senderBlacklist] = findBlacklistPda(this.mintAddress, fromOwnerKey, this.hookProgramId);
    const [receiverBlacklist] = findBlacklistPda(this.mintAddress, toOwnerKey, this.hookProgramId);

    const [seizerRole] = findRolePda(this.configPda, RoleType.Seizer, provider.wallet.publicKey, this.programId);

    return wrapError("seize", () =>
      this.program.methods
        .seize()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .accountsStrict({
          authority: provider.wallet.publicKey,
          config: this.configPda,
          seizerRole,
          mint: this.mintAddress,
          from: frozenAccount,
          to: treasury,
          blacklistEntry: findBlacklistPda(this.mintAddress, fromOwnerKey, this.hookProgramId)[0],
          fromOwner: fromOwnerKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          // Cast required: Anchor strict types expect the full IDL-generated account shape;
          // seize passes only the accounts needed — remaining hook accounts go via remainingAccounts.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .remainingAccounts([
          { pubkey: this.hookProgramId, isSigner: false, isWritable: false },
          { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
          { pubkey: senderBlacklist, isSigner: false, isWritable: false },
          { pubkey: receiverBlacklist, isSigner: false, isWritable: false },
          { pubkey: this.configPda, isSigner: false, isWritable: false },
        ])
        .rpc()
    );
  }

  private async _isBlacklisted(user: PublicKey): Promise<boolean> {
    const [blacklistEntry] = findBlacklistPda(
      this.mintAddress,
      user,
      this.hookProgramId
    );
    const account = await this.connection.getAccountInfo(blacklistEntry);
    return account !== null;
  }

  // --- Reserve Attestation ---

  async attestReserves(params: AttestReservesParams): Promise<TransactionSignature> {
    requirePositiveAmount(params.expiresInSeconds, "expiresInSeconds");
    if (params.attestationUri.length > 256) {
      throw new Error("attestReserves: attestationUri exceeds 256 bytes");
    }

    const [attestorRole] = findRolePda(
      this.configPda,
      RoleType.Attestor,
      params.attestor,
      this.programId
    );
    const [attestationPda] = findAttestationPda(this.configPda, this.programId);

    return wrapError("attestReserves", () =>
      this.program.methods
        .attestReserves(params.reserveAmount, params.expiresInSeconds, params.attestationUri)
        .accountsStrict({
          attestor: params.attestor,
          config: this.configPda,
          attestorRole,
          mint: this.mintAddress,
          attestation: attestationPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    );
  }

  async getAttestation(): Promise<ReserveAttestation | null> {
    const [attestationPda] = findAttestationPda(this.configPda, this.programId);
    try {
      const account = await this.program.account.reserveAttestation.fetch(attestationPda);
      return account as unknown as ReserveAttestation;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Account does not exist") || msg.includes("could not find account")) {
        return null;
      }
      throw new Error(`getAttestation failed: ${msg}`);
    }
  }

  async getCollateralizationRatio(): Promise<number | null> {
    const attestation = await this.getAttestation();
    if (!attestation) return null;

    const supply = attestation.tokenSupply.toNumber();
    if (supply === 0) return 100;

    const reserves = attestation.reserveAmount.toNumber();
    return (reserves / supply) * 100;
  }

  static async listAll(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID,
  ): Promise<RegistryEntry[]> {
    const { program } = SolanaStablecoin.buildPrograms(
      connection,
      wallet,
      programId,
      hookProgramId,
    );

    try {
      // program.account namespace is typed from the IDL; cast via unknown to avoid
      // structural mismatch between generated and inlined IDL account shapes.
      const accountNamespace = program.account as unknown as {
        registryEntry: { all(): Promise<Array<{ account: RegistryEntry }>> };
      };
      const accounts = await accountNamespace.registryEntry.all();
      return accounts.map((a) => a.account);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`listAll failed: unable to fetch registry entries: ${msg}`);
    }
  }
}
