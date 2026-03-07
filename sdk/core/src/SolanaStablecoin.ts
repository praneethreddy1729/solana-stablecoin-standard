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
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./constants";
import {
  findConfigPda,
  findRolePda,
  findBlacklistPda,
  findExtraAccountMetasPda,
} from "./pda";
import {
  RoleType,
  Preset,
  StablecoinConfig,
  InitializeParams,
  MintParams,
  BurnParams,
  FreezeThawParams,
  PauseParams,
  BlacklistParams,
  SeizeParams,
  UpdateRolesParams,
  UpdateMinterQuotaParams,
} from "./types";

import sssTokenIdl from "../../../target/idl/sss_token.json";
import sssTransferHookIdl from "../../../target/idl/sss_transfer_hook.json";
import { SssToken } from "../../../target/types/sss_token";
import { SssTransferHook } from "../../../target/types/sss_transfer_hook";

export class SolanaStablecoin {
  readonly program: Program<SssToken>;
  readonly hookProgram: Program<SssTransferHook>;
  readonly connection: Connection;
  readonly mint: PublicKey;
  readonly configPda: PublicKey;
  readonly configBump: number;
  readonly programId: PublicKey;
  readonly hookProgramId: PublicKey;

  public compliance: {
    blacklistAdd: (params: BlacklistParams) => Promise<TransactionSignature>;
    blacklistRemove: (params: BlacklistParams) => Promise<TransactionSignature>;
    seize: (params: SeizeParams) => Promise<TransactionSignature>;
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
    this.mint = mint;
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
   * Create a new stablecoin: sends the initialize transaction.
   * Returns the SolanaStablecoin instance + mint keypair + tx signature.
   */
  static async create(
    connection: Connection,
    wallet: Wallet,
    params: InitializeParams,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
  ): Promise<{ stablecoin: SolanaStablecoin; mintKeypair: Keypair; txSig: TransactionSignature }> {
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

    const accounts = {
      authority: wallet.publicKey,
      config: configPda,
      mint: mintKeypair.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      hookProgram: enableTransferHook ? hookProgramId : null,
    };

    const txSig = await program.methods
      .initialize({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        decimals: params.decimals,
        enableTransferHook,
        enablePermanentDelegate,
        defaultAccountFrozen,
      })
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
   * Load an existing stablecoin by mint address.
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

  /** Get the current total supply of the mint. */
  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await getMint(
      this.connection,
      this.mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.supply;
  }

  /** Fetch the on-chain StablecoinConfig. */
  async getConfig(): Promise<StablecoinConfig> {
    return (await this.program.account.stablecoinConfig.fetch(
      this.configPda
    )) as unknown as StablecoinConfig;
  }

  /** Mint tokens (requires Minter role). */
  async mintTokens(params: MintParams): Promise<TransactionSignature> {
    const [minterRole] = findRolePda(
      this.configPda,
      RoleType.Minter,
      params.minter,
      this.programId
    );

    return this.program.methods
      .mintTokens(params.amount)
      .accountsStrict({
        minter: params.minter,
        config: this.configPda,
        minterRole,
        mint: this.mint,
        to: params.to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Burn tokens (requires Burner role). */
  async burn(params: BurnParams): Promise<TransactionSignature> {
    const [burnerRole] = findRolePda(
      this.configPda,
      RoleType.Burner,
      params.burner,
      this.programId
    );

    return this.program.methods
      .burnTokens(params.amount)
      .accountsStrict({
        burner: params.burner,
        config: this.configPda,
        burnerRole,
        mint: this.mint,
        from: params.from,
        fromAuthority: params.fromAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Freeze a token account (requires Freezer role). */
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
        mint: this.mint,
        tokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Thaw a frozen token account (requires Freezer role). */
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
        mint: this.mint,
        tokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Pause the token (requires Pauser role). */
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

  /** Unpause the token (requires Pauser role). */
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

  /** Create or update a role assignment (authority only). */
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

  /** Update minter quota (authority only). */
  async updateMinterQuota(
    params: UpdateMinterQuotaParams
  ): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;

    return this.program.methods
      .updateMinterQuota(params.newQuota)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
        minterRole: params.minterRole,
      })
      .rpc();
  }

  /** Initiate authority transfer (current authority only). */
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

  /** Accept authority transfer (pending authority only). */
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

  /** Cancel pending authority transfer (current authority only). */
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

  // --- Compliance sub-object methods (SSS-2) ---

  private async _blacklistAdd(
    params: BlacklistParams
  ): Promise<TransactionSignature> {
    const [blacklisterRole] = findRolePda(
      this.configPda,
      RoleType.Blacklister,
      params.blacklister,
      this.programId
    );
    const [blacklistEntry] = findBlacklistPda(
      this.mint,
      params.user,
      this.hookProgramId
    );

    return this.program.methods
      .addToBlacklist(params.user, params.reason ?? "")
      .accountsStrict({
        blacklister: params.blacklister,
        config: this.configPda,
        blacklisterRole,
        hookProgram: this.hookProgramId,
        blacklistEntry,
        mint: this.mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  private async _blacklistRemove(
    params: BlacklistParams
  ): Promise<TransactionSignature> {
    const [blacklisterRole] = findRolePda(
      this.configPda,
      RoleType.Blacklister,
      params.blacklister,
      this.programId
    );
    const [blacklistEntry] = findBlacklistPda(
      this.mint,
      params.user,
      this.hookProgramId
    );

    return this.program.methods
      .removeFromBlacklist(params.user)
      .accountsStrict({
        blacklister: params.blacklister,
        config: this.configPda,
        blacklisterRole,
        hookProgram: this.hookProgramId,
        blacklistEntry,
        mint: this.mint,
      })
      .rpc();
  }

  private async _seize(params: SeizeParams): Promise<TransactionSignature> {
    const provider = this.program.provider as AnchorProvider;
    const [extraAccountMetasPda] = findExtraAccountMetasPda(this.mint, this.hookProgramId);
    // Derive blacklist PDAs for the from/to token account owners.
    // These may not exist on-chain (non-blacklisted) but must be passed for the hook.
    const fromOwner = (await this.connection.getParsedAccountInfo(params.from))
      ?.value?.data as any;
    const toOwner = (await this.connection.getParsedAccountInfo(params.to))
      ?.value?.data as any;
    const fromOwnerKey = new PublicKey(fromOwner?.parsed?.info?.owner ?? PublicKey.default);
    const toOwnerKey = new PublicKey(toOwner?.parsed?.info?.owner ?? PublicKey.default);
    const [senderBlacklist] = findBlacklistPda(this.mint, fromOwnerKey, this.hookProgramId);
    const [receiverBlacklist] = findBlacklistPda(this.mint, toOwnerKey, this.hookProgramId);

    const [seizerRole] = findRolePda(this.configPda, 5, provider.wallet.publicKey, this.program.programId);

    return this.program.methods
      .seize()
      .accountsStrict({
        authority: provider.wallet.publicKey,
        config: this.configPda,
        seizerRole,
        mint: this.mint,
        from: params.from,
        to: params.to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
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
      this.mint,
      user,
      this.hookProgramId
    );
    const account = await this.connection.getAccountInfo(blacklistEntry);
    return account !== null;
  }
}
