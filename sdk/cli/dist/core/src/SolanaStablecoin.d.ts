import { Program, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, TransactionSignature } from "@solana/web3.js";
import BN from "bn.js";
import { StablecoinConfig, ReserveAttestation, RegistryEntry, InitializeParams, FreezeThawParams, PauseParams, UpdateRolesParams, UpdateMinterQuotaParams, AttestReservesParams } from "./types";
import { SssToken } from "./types/sss_token";
import { SssTransferHook } from "./types/sss_transfer_hook";
import { OraclePriceGuard } from "./oracle";
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
export declare class SolanaStablecoin {
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
    oracle: OraclePriceGuard | null;
    /**
     * @description Compliance sub-object providing blacklist and seizure operations (SSS-2 only).
     * These methods require appropriate roles (Blacklister or Seizer) and will fail on SSS-1 tokens.
     */
    compliance: {
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
    private constructor();
    /**
     * @description Build Anchor Program instances for the SSS token and transfer hook programs.
     * @param connection - Solana RPC connection.
     * @param wallet - Anchor Wallet used as the fee payer and default signer.
     * @param programId - SSS token program ID.
     * @param hookProgramId - SSS transfer hook program ID.
     * @returns An object containing the typed `program` and `hookProgram` instances.
     */
    private static buildPrograms;
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
    static create(connection: Connection, params: InitializeParams, programId?: PublicKey, hookProgramId?: PublicKey): Promise<{
        stablecoin: SolanaStablecoin;
        mintKeypair: Keypair;
        txSig: TransactionSignature;
        hookTxSig: TransactionSignature | null;
    }>;
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
    static load(connection: Connection, wallet: Wallet, mintAddress: PublicKey, programId?: PublicKey, hookProgramId?: PublicKey): Promise<SolanaStablecoin>;
    /**
     * @description Manually initialize the ExtraAccountMetas PDA for the transfer hook program.
     * This is only needed when loading an existing SSS-2 token whose hook metas were not initialized.
     * The {@link create} method automatically calls this for SSS-2 tokens.
     *
     * @returns Transaction signature.
     * @throws If the ExtraAccountMetas PDA already exists or the signer is not the authority.
     */
    initializeHookExtraAccountMetas(): Promise<TransactionSignature>;
    /**
     * @description Get the current total supply of the stablecoin mint from on-chain state.
     * @returns The total supply as a `bigint` in base units (e.g., 1000000 = 1.0 USDC at 6 decimals).
     * @throws If the mint account does not exist or cannot be fetched.
     */
    getTotalSupply(): Promise<bigint>;
    /**
     * @description Fetch the on-chain StablecoinConfig account containing authority, pause state,
     * enabled features, treasury, and other configuration fields.
     * @returns The deserialized {@link StablecoinConfig} object.
     * @throws If the config PDA does not exist (mint was not initialized via SSS).
     */
    getConfig(): Promise<StablecoinConfig>;
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
    mint(params: {
        recipient: PublicKey;
        amount: BN | number;
        minter: PublicKey;
    }): Promise<TransactionSignature>;
    mint(to: PublicKey, amount: BN, minter: PublicKey): Promise<TransactionSignature>;
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
    burn(from: PublicKey, amount: BN, burner: PublicKey, fromAuthority?: PublicKey): Promise<TransactionSignature>;
    /**
     * @description Freeze a token account, preventing all transfers to/from it.
     * Requires the Freezer role. Cannot freeze the treasury account.
     *
     * @param params - {@link FreezeThawParams} containing the token account to freeze and the freezer's public key.
     * @returns Transaction signature.
     * @throws If the token is paused, the signer lacks the Freezer role, or the target is the treasury.
     */
    freeze(params: FreezeThawParams): Promise<TransactionSignature>;
    /**
     * @description Thaw (unfreeze) a previously frozen token account, restoring transfer capabilities.
     * Requires the Freezer role.
     *
     * @param params - {@link FreezeThawParams} containing the token account to thaw and the freezer's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Freezer role or the account is not frozen.
     */
    thaw(params: FreezeThawParams): Promise<TransactionSignature>;
    /**
     * @description Pause all token operations (mint, burn, transfer). Requires the Pauser role.
     * When paused, only `unpause`, `getConfig`, and read-only methods remain functional.
     *
     * @param params - {@link PauseParams} containing the pauser's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Pauser role or the token is already paused.
     */
    pause(params: PauseParams): Promise<TransactionSignature>;
    /**
     * @description Unpause the token, restoring all operations. Requires the Pauser role.
     * Clears both manual pause and attestation-triggered pause flags.
     *
     * @param params - {@link PauseParams} containing the pauser's public key.
     * @returns Transaction signature.
     * @throws If the signer lacks the Pauser role or the token is not paused.
     */
    unpause(params: PauseParams): Promise<TransactionSignature>;
    /**
     * @description Create or update a role assignment. Authority-only operation.
     * Roles control who can perform privileged actions (mint, burn, freeze, pause, blacklist, seize, attest).
     *
     * @param params - {@link UpdateRolesParams} containing the role type, assignee, and active status.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority.
     */
    updateRoles(params: UpdateRolesParams): Promise<TransactionSignature>;
    /**
     * @description Update a minter's quota (maximum allowed mint amount). Authority-only operation.
     *
     * @param params - {@link UpdateMinterQuotaParams} containing the minter role PDA and the new quota.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority or the role PDA is invalid.
     */
    updateMinterQuota(params: UpdateMinterQuotaParams): Promise<TransactionSignature>;
    /**
     * @description Initiate a two-step authority transfer. The new authority must call
     * {@link acceptAuthority} to complete the transfer. Current authority only.
     *
     * @param newAuthority - The public key of the proposed new authority.
     * @returns Transaction signature.
     * @throws If the signer is not the current authority.
     */
    transferAuthority(newAuthority: PublicKey): Promise<TransactionSignature>;
    /**
     * @description Accept a pending authority transfer. Must be called by the pending authority
     * that was set via {@link transferAuthority}.
     *
     * @returns Transaction signature.
     * @throws If the signer is not the pending authority or no transfer is pending.
     */
    acceptAuthority(): Promise<TransactionSignature>;
    /**
     * @description Cancel a pending authority transfer. Current authority only.
     *
     * @returns Transaction signature.
     * @throws If the signer is not the current authority or no transfer is pending.
     */
    cancelAuthorityTransfer(): Promise<TransactionSignature>;
    /**
     * @description Update the treasury token account where seized funds are sent. Authority-only operation.
     *
     * @param newTreasury - The public key of the new treasury Token-2022 associated token account.
     * @returns Transaction signature.
     * @throws If the signer is not the stablecoin authority.
     */
    updateTreasury(newTreasury: PublicKey): Promise<TransactionSignature>;
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
    attachOracleGuard(config: Partial<PriceGuardConfig> & {
        pythFeed: string;
    }): void;
    private _blacklistAdd;
    private _blacklistRemove;
    private _seize;
    private _isBlacklisted;
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
    attestReserves(params: AttestReservesParams): Promise<TransactionSignature>;
    /**
     * @description Fetch the current reserve attestation, or null if none has been submitted.
     * @returns The deserialized {@link ReserveAttestation} or `null`.
     */
    getAttestation(): Promise<ReserveAttestation | null>;
    /**
     * @description Calculate the collateralization ratio based on the latest reserve attestation.
     * @returns The ratio as a percentage (e.g., `100.0` = fully backed, `150.0` = 1.5x overcollateralized),
     *          or `null` if no attestation exists.
     */
    getCollateralizationRatio(): Promise<number | null>;
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
    static listAll(connection: Connection, wallet: Wallet, programId?: PublicKey, hookProgramId?: PublicKey): Promise<RegistryEntry[]>;
}
//# sourceMappingURL=SolanaStablecoin.d.ts.map