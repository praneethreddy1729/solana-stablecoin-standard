import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin } from "../../core/src";
export declare function loadKeypair(keypairPath?: string): Keypair;
export declare function loadWallet(keypairPath?: string): Wallet;
export declare function getConnection(rpcUrl?: string): Connection;
export declare function loadStablecoin(mintAddress: string, opts: {
    rpcUrl?: string;
    keypair?: string;
}): Promise<SolanaStablecoin>;
//# sourceMappingURL=helpers.d.ts.map