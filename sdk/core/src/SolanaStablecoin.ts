import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
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

import sssTokenIdl from "./idl/sss_token.json";
import sssTransferHookIdl from "./idl/sss_transfer_hook.json";
import { SssToken } from "./types/sss_token";
import { SssTransferHook } from "./types/sss_transfer_hook";
import { OraclePriceGuard, PYTH_FEED_IDS } from "./oracle";
import type { PriceGuardConfig } from "./oracle";

/**
 * @description Primary SDK class for interacting with the Solana Stablecoin Standard (SSS).
 * Provides a high-level interface for creating, loading, and managing stablecoins
 * built on Token-2022 with role-based access control, compliance features, and reserve attestation.
 *
 * Supports two presets:
 * - **SSS-1**: Basic stablecoin with mint/burn/pause/freeze capabilities.
 * - **SSS-2**: Full compliance stablecoin with transfer hook, blacklisting, permanent delegate, and seize.
 *
 * @example
 * ```ts
 * import { SolanaStablecoin } from "@stbr/sss-token";
 * import { Connection, Keypair } from "@solana/web3.js";
 *
 * const connection = new Connection("https://api.devnet.solana.com");
 * const authority = Keypair.generate();
 *
 * // Create a new stablecoin
 * const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(connection, {
 *   name: "USD Coin",
 *   symbol: "USDC",
 *   uri: "https://example.com/metadata.json",
 *   decimals: 6,
 *   authority,
 *   preset: Preset.SSS_2,
 * });
 *
 * // Load an existing stablecoin
 * const loaded = await SolanaStablecoin.load(connection, wallet, mintKeypair.publicKey);
 * ```
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

  /**
   * @description Oracle Price Guard instance, set via {@link attachOracleGuard}.
   * Provides Pyth-based price deviation checks and circuit breaker protection.
   * `null` until `attachOracleGuard` is called.
   */
  public oracle: OraclePriceGuard | null = null;

  /**
   * @description Compliance sub-object providing blacklist and seizure operations (SSS-2 only).
   * These methods require appropriate roles (Blacklister or Seizer) and will fail on SSS-1 tokens.
   */
  public compliance: {
    /**
     * @description Add an address to the blacklist, preventing it from sending or receiving tokens.
     * @param address - The wallet address to blacklist.
     * @param blacklister - The public key of the signer with the Blacklister role.
     * @param reason - Optional reason string (max 64 bytes).
     * @returns Transaction signature.
     * @throws If the signer lacks the Blacklister role or the token is SSS-1.
     */
    blacklistAdd: (address: PublicKey, reasonOrBlacklister?: string | PublicKey, reason?: string) => Promise<TransactionSignature>;
    /**
     * @description Remove an address from the blacklist, restoring transfer capabilities.
     * @param address - The wallet address to remove from the blacklist.
     * @param blacklister - The public key of the signer with the Blacklister role.
     * @returns Transaction signature.
     * @throws If the signer lacks the Blacklister role or the address is not blacklisted.
     */
    blacklistRemove: (address: PublicKey, blacklister: PublicKey) => Promise<TransactionSignature>;
    /**
     * @description Seize all tokens from a frozen account and transfer them to the treasury.
     * Uses the permanent delegate extension to force-transfer without owner consent.
     * @param frozenAccount - The frozen token account to seize from.
     * @param treasury - The treasury token account to receive seized funds.
     * @returns Transaction signature.
     * @throws If the signer lacks the Seizer role or the account is not frozen.
     */
    seize: (frozenAccount: PublicKey, treasury: PublicKey) => Promise<TransactionSignature>;
    /**
     * @description Check whether a wallet address is currently blacklisted.
     * @param user - The wallet address to check.
     * @returns `true` if the address has a BlacklistEntry PDA on-chain.
     */
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

  /**
   * @description Build Anchor Program instances for the SSS token and transfer hook programs.
   * @param connection - Solana RPC connection.
   * @param wallet - Anchor Wallet used as the fee payer and default signer.
   * @param programId - SSS token program ID.
   * @param hookProgramId - SSS transfer hook program ID.
   * @returns An object containing the typed `program` and `hookProgram` instances.
   */
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
   * @description Create a new stablecoin by deploying a Token-2022 mint with SSS configuration.
   * Sends the `initialize` instruction, creating the mint, config PDA, and registry entry in one transaction.
   *
   * @param connection - Solana RPC connection.
   * @param params - Initialization parameters including name, symbol, decimals, authority, and optional preset/flags.
   * @param programId - SSS token program ID. Defaults to the canonical deployed program.
   * @param hookProgramId - SSS transfer hook program ID. Defaults to the canonical deployed program.
   * @returns An object containing:
   *   - `stablecoin` - The initialized SolanaStablecoin instance.
   *   - `mintKeypair` - The generated mint Keypair (save the secret key if needed).
   *   - `txSig` - The transaction signature.
   * @throws If the transaction fails (e.g., insufficient SOL, invalid params).
   *
   * @example
   * ```ts
   * const { stablecoin, mintKeypair, txSig } = await SolanaStablecoin.create(connection, {
   *   name: "My Stablecoin",
   *   symbol: "MSC",
   *   uri: "https://example.com/metadata.json",
   *   decimals: 6,
   *   authority: authorityKeypair,
   *   preset: Preset.SSS_2,
   * });
   * console.log("Mint:", mintKeypair.publicKey.toBase58());
   * ```
   */
  static async create(
    connection: Connection,
    params: InitializeParams,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
  ): Promise<{ stablecoin: SolanaStablecoin; mintKeypair: Keypair; txSig: TransactionSignature }> {
    const wallet = params.authority instanceof Keypair
      ? new Wallet(params.authority)
      : params.authority;

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

    const txSig = await program.methods
      .initialize({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri ?? "",
        decimals: params.decimals,
        enableTransferHook,
        enablePermanentDelegate,
        defaultAccountFrozen,
        treasury: params.treasury ?? PublicKey.default,
      } as any)
      .accountsStrict(accounts as any)
      .signers([mintKeypair])
      .rpc();

    const stablecoin = new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      programId,
      hookProgramId,
      program,
      hookProgram
    );

    return { stablecoin, mintKeypair, txSig };
  }

  /**
   * @description Load an existing stablecoin instance by its mint address.
   * Does not verify the mint exists on-chain; call {@link getConfig} to validate.
   *
   * @param connection - Solana RPC connection.
   * @param wallet - Anchor Wallet used as the fee payer and default signer for subsequent operations.
   * @param mintAddress - The public key of the Token-2022 mint.
   * @param programId - SSS token program ID. Defaults to the canonical deployed program.
   * @param hookProgramId - SSS transfer hook program ID. Defaults to the canonical deployed program.
   * @returns A SolanaStablecoin instance bound to the given mint.
   *
   * @example
   * ```ts
   * const stablecoin = await SolanaStablecoin.load(
   *   connection,
   *   wallet,
   *   new PublicKey("tCe3w68q2eo752dzozjGrV8rwhuynfz6T4HtquHf1Gz")
   * );
   * const config = await stablecoin.getConfig();
   * ```
   */
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

  /**
   * @description Get the current total supply of the stablecoin mint from on-chain state.
   * @returns The total supply as a `bigint` in base units (e.g., 1000000 = 1.0 USDC at 6 decimals).
   * @throws If the mint account does not exist or cannot be fetched.
   */
  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await getMint(
      this.connection,
      this.mintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.supply;
  }

  /**
   * @description Fetch the on-chain StablecoinConfig account containing authority, pause state,
   * enabled features, treasury, and other configuration fields.
   * @returns The deserialized {@link StablecoinConfig} object.
   * @throws If the config PDA does not exist (mint was not initialized via SSS).
   */
  async getConfig(): Promise<StablecoinConfig> {
    return (await this.program.account.stablecoinConfig.fetch(
      this.configPda
    )) as unknown as StablecoinConfig;
  }

  /**
   * @description Mint new tokens to a destination token account. Requires the Minter role.
   * The minter's quota is decremented by the minted amount; fails if quota is exceeded.
   *
   * @param to - The destination Token-2022 associated token account.
   * @param amount - The number of tokens to mint (in base units, as BN).
   * @param minter - The public key of the signer with the Minter role.
   * @returns Transaction signature.
   * @throws If the token is paused, the signer lacks the Minter role, or the minter's quota is exceeded.
   *
   * @example
   * ```ts
   * const txSig = await stablecoin.mint(
   *   recipientAta,
   *   new BN(1_000_000), // 1.0 tokens at 6 decimals
   *   minterKeypair.publicKey
   * );
   * ```
   */
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

    if (toOrParams instanceof PublicKey) {
      to = toOrParams;
      mintAmount = amount!;
      minterKey = minter!;
    } else {
      to = toOrParams.recipient;
      mintAmount = toOrParams.amount instanceof BN ? toOrParams.amount : new BN(toOrParams.amount);
      minterKey = toOrParams.minter;
    }

    const [minterRole] = findRolePda(
      this.configPda,
      RoleType.Minter,
      minterKey,
      this.programId
    );

    return this.program.methods
      .mint(mintAmount)
      .accountsStrict({
        minter: minterKey,
        config: this.configPda,
        minterRole,
        mint: this.mintAddress,
        to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * @description Burn tokens from a token account. Requires the Burner role.
   *
   * @param from - The Token-2022 token account to burn from.
   * @param amount - The number of tokens to burn (in base units, as BN).
   * @param burner - The public key of the signer with the Burner role.
   * @param fromAuthority - The authority of the `from` token account. Defaults to `burner` if omitted.
   * @returns Transaction signature.
   * @throws If the token is paused or the signer lacks the Burner role.
   *
   * @example
   * ```ts
   * const txSig = await stablecoin.burn(
   *   userAta,
   *   new BN(500_000),
   *   burnerKeypair.publicKey
   * );
   * ```
   */
  async burn(from: PublicKey, amount: BN, burner: PublicKey, fromAuthority?: PublicKey): Promise<TransactionSignature> {
    const [burnerRole] = findRolePda(
      this.configPda,
      RoleType.Burner,
      burner,
      this.programId
    );

    return this.program.methods
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
      .rpc();
  }

  /**
   * @description Freeze a token account, preventing all transfers to/from it.
   * Requires the Freezer role. Cannot freeze the treasury account.
   *
   * @param params - {@link FreezeThawParams} containing the token account to freeze and the freezer's public key.
   * @returns Transaction signature.
   * @throws If the token is paused, the signer lacks the Freezer role, or the target is the treasury.
   */
  async freeze(params: FreezeThawParams): Promise<TransactionSignature> {
    const [freezerRole] = findRolePda(
      this.configPda,
      RoleType.Freezer,
      params.freezer,
      this.programId
    );

    return this.program.methods
      .freezeAccount()
      .accountsStrict({
        freezer: params.freezer,
        config: this.configPda,
        freezerRole,
        mint: this.mintAddress,
        tokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * @description Thaw (unfreeze) a previously frozen token account, restoring transfer capabilities.
   * Requires the Freezer role.
   *
   * @param params - {@link FreezeThawParams} containing the token account to thaw and the freezer's public key.
   * @returns Transaction signature.
   * @throws If the signer lacks the Freezer role or the account is not frozen.
   */
  async thaw(params: FreezeThawParams): Promise<TransactionSignature> {
    const [freezerRole] = findRolePda(
      this.configPda,
      RoleType.Freezer,
      params.freezer,
      this.programId
    );

    return this.program.methods
      .thawAccount()
      .accountsStrict({
        freezer: params.freezer,
        config: this.configPda,
        freezerRole,
        mint: this.mintAddress,
        tokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * @description Pause all token operations (mint, burn, transfer). Requires the Pauser role.
   * When paused, only `unpause`, `getConfig`, and read-only methods remain functional.
   *
   * @param params - {@link PauseParams} containing the pauser's public key.
   * @returns Transaction signature.
   * @throws If the signer lacks the Pauser role or the token is already paused.
   */
  async pause(params: PauseParams): Promise<TransactionSignature> {
    const [pauserRole] = findRolePda(
      this.configPda,
      RoleType.Pauser,
      params.pauser,
      this.programId
    );

    return this.program.methods
      .pause()
      .accountsStrict({
        pauser: params.pauser,
        config: this.configPda,
        pauserRole,
      })
      .rpc();
  }

  /**
   * @description Unpause the token, restoring all operations. Requires the Pauser role.
   * Clears both manual pause and attestation-triggered pause flags.
   *
   * @param params - {@link PauseParams} containing the pauser's public key.
   * @returns Transaction signature.
   * @throws If the signer lacks the Pauser role or the token is not paused.
   */
  async unpause(params: PauseParams): Promise<TransactionSignature> {
    const [pauserRole] = findRolePda(
      this.configPda,
      RoleType.Pauser,
      params.pauser,
      this.programId
    );

    return this.program.methods
      .unpause()
      .accountsStrict({
        pauser: params.pauser,
        config: this.configPda,
        pauserRole,
      })
      .rpc();
  }

  /**
   * @description Create or update a role assignment. Authority-only operation.
   * Roles control who can perform privileged actions (mint, burn, freeze, pause, blacklist, seize, attest).
   *
   * @param params - {@link UpdateRolesParams} containing the role type, assignee, and active status.
   * @returns Transaction signature.
   * @throws If the signer is not the stablecoin authority.
   */
  async updateRoles(params: UpdateRolesParams): Promise<TransactionSignature> {
    const [rolePda] = findRolePda(
      this.configPda,
      params.roleType,
      params.assignee,
      this.programId
    );
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .updateRoles(params.roleType, params.assignee, params.isActive)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
        role: rolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * @description Update a minter's quota (maximum allowed mint amount). Authority-only operation.
   *
   * @param params - {@link UpdateMinterQuotaParams} containing the minter role PDA and the new quota.
   * @returns Transaction signature.
   * @throws If the signer is not the stablecoin authority or the role PDA is invalid.
   */
  async updateMinterQuota(
    params: UpdateMinterQuotaParams
  ): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .updateMinter(params.newQuota)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
        minterRole: params.minterRole,
      })
      .rpc();
  }

  /**
   * @description Initiate a two-step authority transfer. The new authority must call
   * {@link acceptAuthority} to complete the transfer. Current authority only.
   *
   * @param newAuthority - The public key of the proposed new authority.
   * @returns Transaction signature.
   * @throws If the signer is not the current authority.
   */
  async transferAuthority(
    newAuthority: PublicKey
  ): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .transferAuthority(newAuthority)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
      })
      .rpc();
  }

  /**
   * @description Accept a pending authority transfer. Must be called by the pending authority
   * that was set via {@link transferAuthority}.
   *
   * @returns Transaction signature.
   * @throws If the signer is not the pending authority or no transfer is pending.
   */
  async acceptAuthority(): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .acceptAuthority()
      .accountsStrict({
        newAuthority: provider.wallet.publicKey,
        config: this.configPda,
      })
      .rpc();
  }

  /**
   * @description Cancel a pending authority transfer. Current authority only.
   *
   * @returns Transaction signature.
   * @throws If the signer is not the current authority or no transfer is pending.
   */
  async cancelAuthorityTransfer(): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .cancelAuthorityTransfer()
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
      })
      .rpc();
  }

  /**
   * @description Update the treasury token account where seized funds are sent. Authority-only operation.
   *
   * @param newTreasury - The public key of the new treasury Token-2022 associated token account.
   * @returns Transaction signature.
   * @throws If the signer is not the stablecoin authority.
   */
  async updateTreasury(newTreasury: PublicKey): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .updateTreasury(newTreasury)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
      })
      .rpc();
  }

  /**
   * @description Attach an Oracle Price Guard to this stablecoin instance.
   * After calling this, `stable.oracle` is available for price checks and monitoring.
   *
   * Accepts a Pyth feed alias (e.g., `"USDC/USD"`) or a full hex feed ID.
   * All other `PriceGuardConfig` fields are optional and have sensible defaults:
   * - `circuitBreakerThreshold` defaults to 3
   *
   * @param config - Config object with required `pythFeed` and optional guard parameters.
   *
   * @example
   * ```ts
   * stable.attachOracleGuard({
   *   pythFeed: "USDC/USD",
   *   targetPrice: 1.0,
   *   maxDeviationBps: 200,
   *   maxStalenessSecs: 60,
   * });
   * const result = await stable.oracle!.checkPrice();
   * ```
   */
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

    return this.program.methods
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
      .rpc();
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

    return this.program.methods
      .removeFromBlacklist(address)
      .accountsStrict({
        blacklister,
        config: this.configPda,
        blacklisterRole,
        hookProgram: this.hookProgramId,
        blacklistEntry,
        mint: this.mintAddress,
      })
      .rpc();
  }

  private async _seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;
    const [extraAccountMetasPda] = findExtraAccountMetasPda(this.mintAddress, this.hookProgramId);
    // Derive blacklist PDAs for the from/to token account owners.
    // These may not exist on-chain (non-blacklisted) but must be passed for the hook.
    const fromOwner = (await this.connection.getParsedAccountInfo(frozenAccount))
      ?.value?.data as any;
    const toOwner = (await this.connection.getParsedAccountInfo(treasury))
      ?.value?.data as any;
    const fromOwnerKey = new PublicKey(fromOwner?.parsed?.info?.owner ?? PublicKey.default);
    const toOwnerKey = new PublicKey(toOwner?.parsed?.info?.owner ?? PublicKey.default);
    const [senderBlacklist] = findBlacklistPda(this.mintAddress, fromOwnerKey, this.hookProgramId);
    const [receiverBlacklist] = findBlacklistPda(this.mintAddress, toOwnerKey, this.hookProgramId);

    const [seizerRole] = findRolePda(this.configPda, 5, provider.wallet.publicKey, this.program.programId);

    return this.program.methods
      .seize()
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
      } as any)
      .remainingAccounts([
        { pubkey: this.hookProgramId, isSigner: false, isWritable: false },
        { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
        { pubkey: senderBlacklist, isSigner: false, isWritable: false },
        { pubkey: receiverBlacklist, isSigner: false, isWritable: false },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
      ])
      .rpc();
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

  /**
   * @description Submit a reserve attestation proving the stablecoin is backed by real reserves.
   * If the attested reserve amount is less than the current token supply, minting is
   * automatically paused via the `paused_by_attestation` flag (undercollateralized protection).
   * Requires the Attestor role.
   *
   * @param params - {@link AttestReservesParams} containing:
   *   - `reserveAmount` - The total reserve amount backing the stablecoin (BN, in base units).
   *   - `expiresInSeconds` - How many seconds until this attestation expires (BN, must be positive).
   *   - `attestationUri` - URI pointing to off-chain proof of reserves (max 256 bytes).
   *   - `attestor` - The public key of the signer with the Attestor role.
   * @returns Transaction signature.
   * @throws If the signer lacks the Attestor role, the URI exceeds 256 bytes,
   *         or the expiration is not positive.
   *
   * @example
   * ```ts
   * const txSig = await stablecoin.attestReserves({
   *   reserveAmount: new BN(10_000_000_000),
   *   expiresInSeconds: new BN(86400), // 24 hours
   *   attestationUri: "https://example.com/proof-of-reserves.json",
   *   attestor: attestorKeypair.publicKey,
   * });
   * ```
   */
  async attestReserves(params: AttestReservesParams): Promise<TransactionSignature> {
    const [attestorRole] = findRolePda(
      this.configPda,
      RoleType.Attestor,
      params.attestor,
      this.programId
    );
    const [attestationPda] = findAttestationPda(this.configPda, this.programId);

    return this.program.methods
      .attestReserves(params.reserveAmount, params.expiresInSeconds, params.attestationUri)
      .accountsStrict({
        attestor: params.attestor,
        config: this.configPda,
        attestorRole,
        mint: this.mintAddress,
        attestation: attestationPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * @description Fetch the current reserve attestation, or null if none has been submitted.
   * @returns The deserialized {@link ReserveAttestation} or `null`.
   */
  async getAttestation(): Promise<ReserveAttestation | null> {
    const [attestationPda] = findAttestationPda(this.configPda, this.programId);
    try {
      const account = await this.program.account.reserveAttestation.fetch(attestationPda);
      return account as unknown as ReserveAttestation;
    } catch {
      return null;
    }
  }

  /**
   * @description Calculate the collateralization ratio based on the latest reserve attestation.
   * @returns The ratio as a percentage (e.g., `100.0` = fully backed, `150.0` = 1.5x overcollateralized),
   *          or `null` if no attestation exists.
   */
  async getCollateralizationRatio(): Promise<number | null> {
    const attestation = await this.getAttestation();
    if (!attestation) return null;

    const supply = attestation.tokenSupply.toNumber();
    if (supply === 0) return 100;

    const reserves = attestation.reserveAmount.toNumber();
    return (reserves / supply) * 100;
  }

  /**
   * @description List all SSS-registered stablecoins by fetching RegistryEntry accounts
   * via `getProgramAccounts`. Useful for building explorers or dashboards that discover
   * all stablecoins in the ecosystem.
   *
   * @param connection - Solana RPC connection.
   * @param wallet - Anchor Wallet (needed for program instantiation).
   * @param programId - SSS token program ID. Defaults to the canonical deployed program.
   * @param hookProgramId - SSS transfer hook program ID. Defaults to the canonical deployed program.
   * @returns An array of {@link RegistryEntry} objects, one per registered stablecoin.
   *
   * @example
   * ```ts
   * const allStablecoins = await SolanaStablecoin.listAll(connection, wallet);
   * for (const entry of allStablecoins) {
   *   console.log(`${entry.symbol}: ${entry.mint.toBase58()}`);
   * }
   * ```
   */
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

    const accounts = await (program.account as any).registryEntry.all();
    return accounts.map((a: any) => a.account as RegistryEntry);
  }
}
