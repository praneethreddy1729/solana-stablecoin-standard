"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaStablecoin = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const constants_1 = require("./constants");
const pda_1 = require("./pda");
const types_1 = require("./types");
const errors_1 = require("./errors");
const sss_token_json_1 = __importDefault(require("./idl/sss_token.json"));
const sss_transfer_hook_json_1 = __importDefault(require("./idl/sss_transfer_hook.json"));
const oracle_1 = require("./oracle");
/**
 * Wrap an SDK operation with descriptive error handling.
 * Attempts to parse on-chain program errors into human-readable messages.
 */
async function wrapError(operation, fn) {
    try {
        return await fn();
    }
    catch (err) {
        const parsed = (0, errors_1.parseSSSError)(err);
        if (parsed) {
            throw new Error(`${operation} failed: ${parsed.name} — ${parsed.msg}`);
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${operation} failed: ${msg}`);
    }
}
/** Validate that a BN amount is positive (> 0). */
function requirePositiveAmount(amount, label) {
    // Use toString() comparison to handle cross-package BN instances
    const val = new bn_js_1.default(amount.toString());
    if (val.lten(0)) {
        throw new Error(`${label} must be greater than zero`);
    }
}
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
class SolanaStablecoin {
    constructor(connection, mint, programId, hookProgramId, program, hookProgram) {
        /**
         * @description Oracle Price Guard instance, set via {@link attachOracleGuard}.
         * Provides Pyth-based price deviation checks and circuit breaker protection.
         * `null` until `attachOracleGuard` is called.
         */
        this.oracle = null;
        this.connection = connection;
        this.mintAddress = mint;
        this.programId = programId;
        this.hookProgramId = hookProgramId;
        this.program = program;
        this.hookProgram = hookProgram;
        const [configPda, configBump] = (0, pda_1.findConfigPda)(mint, programId);
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
    static buildPrograms(connection, wallet, programId, hookProgramId) {
        const provider = new anchor_1.AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });
        const program = new anchor_1.Program(sss_token_json_1.default, provider);
        const hookProgram = new anchor_1.Program(sss_transfer_hook_json_1.default, provider);
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
     *   - `txSig` - The transaction signature for the initialize instruction.
     *   - `hookTxSig` - The transaction signature for the hook's `initializeExtraAccountMetas`
     *     instruction (SSS-2 only; `null` for SSS-1 or when transfer hook is disabled).
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
    static async create(connection, params, programId = constants_1.SSS_TOKEN_PROGRAM_ID, hookProgramId = constants_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
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
            ? new anchor_1.Wallet(params.authority)
            : params.authority;
        const { program, hookProgram } = SolanaStablecoin.buildPrograms(connection, wallet, programId, hookProgramId);
        const mintKeypair = web3_js_1.Keypair.generate();
        const [configPda] = (0, pda_1.findConfigPda)(mintKeypair.publicKey, programId);
        let enableTransferHook = params.enableTransferHook ?? false;
        let enablePermanentDelegate = params.enablePermanentDelegate ?? false;
        let defaultAccountFrozen = params.defaultAccountFrozen ?? false;
        if (params.preset === types_1.Preset.SSS_1) {
            enableTransferHook = false;
            enablePermanentDelegate = false;
            defaultAccountFrozen = false;
        }
        else if (params.preset === types_1.Preset.SSS_2) {
            enableTransferHook = true;
            enablePermanentDelegate = true;
            defaultAccountFrozen = false;
        }
        // Allow explicit extensions to override preset defaults
        if (params.extensions) {
            if (params.extensions.permanentDelegate !== undefined)
                enablePermanentDelegate = params.extensions.permanentDelegate;
            if (params.extensions.transferHook !== undefined)
                enableTransferHook = params.extensions.transferHook;
            if (params.extensions.defaultAccountFrozen !== undefined)
                defaultAccountFrozen = params.extensions.defaultAccountFrozen;
        }
        const [registryEntry] = (0, pda_1.findRegistryEntryPda)(mintKeypair.publicKey, programId);
        const accounts = {
            authority: wallet.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            registryEntry,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            hookProgram: enableTransferHook ? hookProgramId : null,
        };
        const txSig = await wrapError("initialize", () => program.methods
            .initialize({
            name: params.name,
            symbol: params.symbol,
            uri: params.uri ?? "",
            decimals: params.decimals,
            enableTransferHook,
            enablePermanentDelegate,
            defaultAccountFrozen,
            treasury: params.treasury ?? web3_js_1.PublicKey.default,
        })
            .accountsStrict(accounts)
            .signers([mintKeypair])
            .rpc());
        // For SSS-2 tokens with transfer hook enabled, automatically initialize
        // the ExtraAccountMetas PDA on the hook program. Without this, transfers
        // will fail because the hook's extra account metas aren't set up.
        let hookTxSig = null;
        if (enableTransferHook) {
            const [extraAccountMetasPda] = (0, pda_1.findExtraAccountMetasPda)(mintKeypair.publicKey, hookProgramId);
            hookTxSig = await wrapError("initializeExtraAccountMetas", () => hookProgram.methods
                .initializeExtraAccountMetas()
                .accountsStrict({
                payer: wallet.publicKey,
                extraAccountMetas: extraAccountMetasPda,
                mint: mintKeypair.publicKey,
                config: configPda,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .rpc());
        }
        const stablecoin = new SolanaStablecoin(connection, mintKeypair.publicKey, programId, hookProgramId, program, hookProgram);
        return { stablecoin, mintKeypair, txSig, hookTxSig };
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
    static async load(connection, wallet, mintAddress, programId = constants_1.SSS_TOKEN_PROGRAM_ID, hookProgramId = constants_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
        const { program, hookProgram } = SolanaStablecoin.buildPrograms(connection, wallet, programId, hookProgramId);
        return new SolanaStablecoin(connection, mintAddress, programId, hookProgramId, program, hookProgram);
    }
    /**
     * @description Manually initialize the ExtraAccountMetas PDA for the transfer hook program.
     * This is only needed when loading an existing SSS-2 token whose hook metas were not initialized.
     * The {@link create} method automatically calls this for SSS-2 tokens.
     *
     * @returns Transaction signature.
     * @throws If the ExtraAccountMetas PDA already exists or the signer is not the authority.
     */
    async initializeHookExtraAccountMetas() {
        const [extraAccountMetasPda] = (0, pda_1.findExtraAccountMetasPda)(this.mintAddress, this.hookProgramId);
        const provider = this.hookProgram.provider;
        return wrapError("initializeExtraAccountMetas", () => this.hookProgram.methods
            .initializeExtraAccountMetas()
            .accountsStrict({
            payer: provider.wallet.publicKey,
            extraAccountMetas: extraAccountMetasPda,
            mint: this.mintAddress,
            config: this.configPda,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc());
    }
    /**
     * @description Get the current total supply of the stablecoin mint from on-chain state.
     * @returns The total supply as a `bigint` in base units (e.g., 1000000 = 1.0 USDC at 6 decimals).
     * @throws If the mint account does not exist or cannot be fetched.
     */
    async getTotalSupply() {
        try {
            const mintInfo = await (0, spl_token_1.getMint)(this.connection, this.mintAddress, "confirmed", spl_token_1.TOKEN_2022_PROGRAM_ID);
            return mintInfo.supply;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`getTotalSupply failed for mint ${this.mintAddress.toBase58()}: ${msg}`);
        }
    }
    /**
     * @description Fetch the on-chain StablecoinConfig account containing authority, pause state,
     * enabled features, treasury, and other configuration fields.
     * @returns The deserialized {@link StablecoinConfig} object.
     * @throws If the config PDA does not exist (mint was not initialized via SSS).
     */
    async getConfig() {
        try {
            return (await this.program.account.stablecoinConfig.fetch(this.configPda));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`getConfig failed: config PDA ${this.configPda.toBase58()} not found. ` +
                `Was this mint initialized via SSS? ${msg}`);
        }
    }
    async mint(toOrParams, amount, minter) {
        let to;
        let mintAmount;
        let minterKey;
        // Duck-type: PublicKey has toBase58(), object params have .recipient
        const isPositional = typeof toOrParams.toBase58 === "function" && !("recipient" in toOrParams);
        if (isPositional) {
            if (!amount)
                throw new Error("mint: amount is required");
            if (!minter)
                throw new Error("mint: minter is required");
            to = toOrParams;
            mintAmount = amount;
            minterKey = minter;
        }
        else {
            const p = toOrParams;
            to = p.recipient;
            mintAmount = typeof p.amount === "number" ? new bn_js_1.default(p.amount) : new bn_js_1.default(p.amount.toString());
            minterKey = p.minter;
        }
        requirePositiveAmount(mintAmount, "mint amount");
        const [minterRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Minter, minterKey, this.programId);
        return wrapError("mint", () => this.program.methods
            .mint(mintAmount)
            .accountsStrict({
            minter: minterKey,
            config: this.configPda,
            minterRole,
            mint: this.mintAddress,
            to,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .rpc());
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
    async burn(from, amount, burner, fromAuthority) {
        requirePositiveAmount(amount, "burn amount");
        const [burnerRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Burner, burner, this.programId);
        return wrapError("burn", () => this.program.methods
            .burn(amount)
            .accountsStrict({
            burner,
            config: this.configPda,
            burnerRole,
            mint: this.mintAddress,
            from,
            fromAuthority: fromAuthority ?? burner,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .rpc());
    }
    /**
     * @description Freeze a token account, preventing all transfers to/from it.
     * Requires the Freezer role. Cannot freeze the treasury account.
     *
     * @param params - {@link FreezeThawParams} containing the token account to freeze and the freezer's public key.
     * @returns Transaction signature.
     * @throws If the token is paused, the signer lacks the Freezer role, or the target is the treasury.
     */
    async freeze(params) {
        const [freezerRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Freezer, params.freezer, this.programId);
        return wrapError("freeze", () => this.program.methods
            .freezeAccount()
            .accountsStrict({
            freezer: params.freezer,
            config: this.configPda,
            freezerRole,
            mint: this.mintAddress,
            tokenAccount: params.tokenAccount,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .rpc());
    }
    /**
     * @description Thaw (unfreeze) a previously frozen token account, restoring transfer capabilities.
     * Requires the Freezer role.
     *
     * @param params - {@link FreezeThawParams} containing the token account to thaw and the freezer's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Freezer role or the account is not frozen.
     */
    async thaw(params) {
        const [freezerRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Freezer, params.freezer, this.programId);
        return wrapError("thaw", () => this.program.methods
            .thawAccount()
            .accountsStrict({
            freezer: params.freezer,
            config: this.configPda,
            freezerRole,
            mint: this.mintAddress,
            tokenAccount: params.tokenAccount,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .rpc());
    }
    /**
     * @description Pause all token operations (mint, burn, transfer). Requires the Pauser role.
     * When paused, only `unpause`, `getConfig`, and read-only methods remain functional.
     *
     * @param params - {@link PauseParams} containing the pauser's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Pauser role or the token is already paused.
     */
    async pause(params) {
        const [pauserRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Pauser, params.pauser, this.programId);
        return wrapError("pause", () => this.program.methods
            .pause()
            .accountsStrict({
            pauser: params.pauser,
            config: this.configPda,
            pauserRole,
        })
            .rpc());
    }
    /**
     * @description Unpause the token, restoring all operations. Requires the Pauser role.
     * Clears both manual pause and attestation-triggered pause flags.
     *
     * @param params - {@link PauseParams} containing the pauser's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Pauser role or the token is not paused.
     */
    async unpause(params) {
        const [pauserRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Pauser, params.pauser, this.programId);
        return wrapError("unpause", () => this.program.methods
            .unpause()
            .accountsStrict({
            pauser: params.pauser,
            config: this.configPda,
            pauserRole,
        })
            .rpc());
    }
    /**
     * @description Create or update a role assignment. Authority-only operation.
     * Roles control who can perform privileged actions (mint, burn, freeze, pause, blacklist, seize, attest).
     *
     * @param params - {@link UpdateRolesParams} containing the role type, assignee, and active status.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority.
     */
    async updateRoles(params) {
        const [rolePda] = (0, pda_1.findRolePda)(this.configPda, params.roleType, params.assignee, this.programId);
        const provider = this.program.provider;
        return wrapError("updateRoles", () => this.program.methods
            .updateRoles(params.roleType, params.assignee, params.isActive)
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
            role: rolePda,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc());
    }
    /**
     * @description Update a minter's quota (maximum allowed mint amount). Authority-only operation.
     *
     * @param params - {@link UpdateMinterQuotaParams} containing the minter role PDA and the new quota.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority or the role PDA is invalid.
     */
    async updateMinterQuota(params) {
        requirePositiveAmount(params.newQuota, "minter quota");
        const provider = this.program.provider;
        return wrapError("updateMinterQuota", () => this.program.methods
            .updateMinter(params.newQuota)
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
            minterRole: params.minterRole,
        })
            .rpc());
    }
    /**
     * @description Initiate a two-step authority transfer. The new authority must call
     * {@link acceptAuthority} to complete the transfer. Current authority only.
     *
     * @param newAuthority - The public key of the proposed new authority.
     * @returns Transaction signature.
     * @throws If the signer is not the current authority.
     */
    async transferAuthority(newAuthority) {
        if (newAuthority.equals(web3_js_1.PublicKey.default)) {
            throw new Error("transferAuthority: newAuthority cannot be the default/zero public key");
        }
        const provider = this.program.provider;
        return wrapError("transferAuthority", () => this.program.methods
            .transferAuthority(newAuthority)
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
        })
            .rpc());
    }
    /**
     * @description Accept a pending authority transfer. Must be called by the pending authority
     * that was set via {@link transferAuthority}.
     *
     * @returns Transaction signature.
     * @throws If the signer is not the pending authority or no transfer is pending.
     */
    async acceptAuthority() {
        const provider = this.program.provider;
        return wrapError("acceptAuthority", () => this.program.methods
            .acceptAuthority()
            .accountsStrict({
            newAuthority: provider.wallet.publicKey,
            config: this.configPda,
        })
            .rpc());
    }
    /**
     * @description Cancel a pending authority transfer. Current authority only.
     *
     * @returns Transaction signature.
     * @throws If the signer is not the current authority or no transfer is pending.
     */
    async cancelAuthorityTransfer() {
        const provider = this.program.provider;
        return wrapError("cancelAuthorityTransfer", () => this.program.methods
            .cancelAuthorityTransfer()
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
        })
            .rpc());
    }
    /**
     * @description Update the treasury token account where seized funds are sent. Authority-only operation.
     *
     * @param newTreasury - The public key of the new treasury Token-2022 associated token account.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority.
     */
    async updateTreasury(newTreasury) {
        if (newTreasury.equals(web3_js_1.PublicKey.default)) {
            throw new Error("updateTreasury: newTreasury cannot be the default/zero public key");
        }
        const provider = this.program.provider;
        return wrapError("updateTreasury", () => this.program.methods
            .updateTreasury(newTreasury)
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
        })
            .rpc());
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
    attachOracleGuard(config) {
        // Resolve feed alias to full hex ID if it matches a known alias
        const resolvedFeed = oracle_1.PYTH_FEED_IDS[config.pythFeed] ??
            config.pythFeed;
        this.oracle = new oracle_1.OraclePriceGuard({
            targetPrice: 1.0,
            maxDeviationBps: 200,
            maxStalenessSecs: 60,
            circuitBreakerThreshold: 3,
            ...config,
            pythFeed: resolvedFeed,
        });
    }
    // --- Compliance sub-object methods (SSS-2) ---
    async _blacklistAdd(address, reasonOrBlacklister, reason) {
        let blacklisterKey;
        let reasonStr;
        if (typeof reasonOrBlacklister === 'string') {
            // 2-arg form: blacklistAdd(address, reason) — use wallet as blacklister
            const provider = this.program.provider;
            blacklisterKey = provider.wallet.publicKey;
            reasonStr = reasonOrBlacklister;
        }
        else {
            // 3-arg form: blacklistAdd(address, blacklister, reason)
            const provider = this.program.provider;
            blacklisterKey = reasonOrBlacklister ?? provider.wallet.publicKey;
            reasonStr = reason ?? "";
        }
        const [blacklisterRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Blacklister, blacklisterKey, this.programId);
        const [blacklistEntry] = (0, pda_1.findBlacklistPda)(this.mintAddress, address, this.hookProgramId);
        return wrapError("blacklistAdd", () => this.program.methods
            .addToBlacklist(address, reasonStr)
            .accountsStrict({
            blacklister: blacklisterKey,
            config: this.configPda,
            blacklisterRole,
            hookProgram: this.hookProgramId,
            blacklistEntry,
            mint: this.mintAddress,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc());
    }
    async _blacklistRemove(address, blacklister) {
        const [blacklisterRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Blacklister, blacklister, this.programId);
        const [blacklistEntry] = (0, pda_1.findBlacklistPda)(this.mintAddress, address, this.hookProgramId);
        return wrapError("blacklistRemove", () => this.program.methods
            .removeFromBlacklist(address)
            .accountsStrict({
            blacklister,
            config: this.configPda,
            blacklisterRole,
            hookProgram: this.hookProgramId,
            blacklistEntry,
            mint: this.mintAddress,
        })
            .rpc());
    }
    async _seize(frozenAccount, treasury) {
        const provider = this.program.provider;
        const [extraAccountMetasPda] = (0, pda_1.findExtraAccountMetasPda)(this.mintAddress, this.hookProgramId);
        // Derive blacklist PDAs for the from/to token account owners.
        // These may not exist on-chain (non-blacklisted) but must be passed for the hook.
        const fromOwner = (await this.connection.getParsedAccountInfo(frozenAccount))
            ?.value?.data;
        const toOwner = (await this.connection.getParsedAccountInfo(treasury))
            ?.value?.data;
        const fromOwnerKey = new web3_js_1.PublicKey(fromOwner?.parsed?.info?.owner ?? web3_js_1.PublicKey.default);
        const toOwnerKey = new web3_js_1.PublicKey(toOwner?.parsed?.info?.owner ?? web3_js_1.PublicKey.default);
        const [senderBlacklist] = (0, pda_1.findBlacklistPda)(this.mintAddress, fromOwnerKey, this.hookProgramId);
        const [receiverBlacklist] = (0, pda_1.findBlacklistPda)(this.mintAddress, toOwnerKey, this.hookProgramId);
        const [seizerRole] = (0, pda_1.findRolePda)(this.configPda, 5, provider.wallet.publicKey, this.program.programId);
        return wrapError("seize", () => this.program.methods
            .seize()
            .accountsStrict({
            authority: provider.wallet.publicKey,
            config: this.configPda,
            seizerRole,
            mint: this.mintAddress,
            from: frozenAccount,
            to: treasury,
            blacklistEntry: (0, pda_1.findBlacklistPda)(this.mintAddress, fromOwnerKey, this.hookProgramId)[0],
            fromOwner: fromOwnerKey,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .remainingAccounts([
            { pubkey: this.hookProgramId, isSigner: false, isWritable: false },
            { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
            { pubkey: senderBlacklist, isSigner: false, isWritable: false },
            { pubkey: receiverBlacklist, isSigner: false, isWritable: false },
            { pubkey: this.configPda, isSigner: false, isWritable: false },
        ])
            .rpc());
    }
    async _isBlacklisted(user) {
        const [blacklistEntry] = (0, pda_1.findBlacklistPda)(this.mintAddress, user, this.hookProgramId);
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
    async attestReserves(params) {
        requirePositiveAmount(params.expiresInSeconds, "expiresInSeconds");
        if (params.attestationUri.length > 256) {
            throw new Error("attestReserves: attestationUri exceeds 256 bytes");
        }
        const [attestorRole] = (0, pda_1.findRolePda)(this.configPda, types_1.RoleType.Attestor, params.attestor, this.programId);
        const [attestationPda] = (0, pda_1.findAttestationPda)(this.configPda, this.programId);
        return wrapError("attestReserves", () => this.program.methods
            .attestReserves(params.reserveAmount, params.expiresInSeconds, params.attestationUri)
            .accountsStrict({
            attestor: params.attestor,
            config: this.configPda,
            attestorRole,
            mint: this.mintAddress,
            attestation: attestationPda,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc());
    }
    /**
     * @description Fetch the current reserve attestation, or null if none has been submitted.
     * @returns The deserialized {@link ReserveAttestation} or `null`.
     */
    async getAttestation() {
        const [attestationPda] = (0, pda_1.findAttestationPda)(this.configPda, this.programId);
        try {
            const account = await this.program.account.reserveAttestation.fetch(attestationPda);
            return account;
        }
        catch {
            return null;
        }
    }
    /**
     * @description Calculate the collateralization ratio based on the latest reserve attestation.
     * @returns The ratio as a percentage (e.g., `100.0` = fully backed, `150.0` = 1.5x overcollateralized),
     *          or `null` if no attestation exists.
     */
    async getCollateralizationRatio() {
        const attestation = await this.getAttestation();
        if (!attestation)
            return null;
        const supply = attestation.tokenSupply.toNumber();
        if (supply === 0)
            return 100;
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
    static async listAll(connection, wallet, programId = constants_1.SSS_TOKEN_PROGRAM_ID, hookProgramId = constants_1.SSS_TRANSFER_HOOK_PROGRAM_ID) {
        const { program } = SolanaStablecoin.buildPrograms(connection, wallet, programId, hookProgramId);
        try {
            const accounts = await program.account.registryEntry.all();
            return accounts.map((a) => a.account);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`listAll failed: unable to fetch registry entries: ${msg}`);
        }
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
//# sourceMappingURL=SolanaStablecoin.js.map