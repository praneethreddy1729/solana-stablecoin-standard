"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  ROLE_NAMES,
} from "@/lib/constants";

import sssTokenIdl from "../../../target/idl/sss_token.json";
import sssTransferHookIdl from "../../../target/idl/sss_transfer_hook.json";

// PDA helpers (inline to avoid deep import issues)
function findConfigPda(mint: PublicKey, programId: PublicKey = SSS_TOKEN_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED, mint.toBuffer()], programId);
}

function findRolePda(config: PublicKey, roleType: number, assignee: PublicKey, programId: PublicKey = SSS_TOKEN_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([roleType]), assignee.toBuffer()],
    programId
  );
}

function findBlacklistPda(mint: PublicKey, user: PublicKey, hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), user.toBuffer()],
    hookProgramId
  );
}

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
}

export interface RoleInfo {
  roleType: number;
  roleName: string;
  assignee: PublicKey;
  isActive: boolean;
  minterQuota: BN;
  mintedAmount: BN;
  pda: PublicKey;
}

export interface TokenAccountInfo {
  balance: bigint;
  isFrozen: boolean;
  address: PublicKey;
}

export function useStablecoin() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const [mintAddress, setMintAddress] = useState<string>("");
  const [config, setConfig] = useState<StablecoinConfig | null>(null);
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const [decimals, setDecimals] = useState<number>(6);
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [userTokenAccount, setUserTokenAccount] = useState<TokenAccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build Anchor program instances
  const { program, hookProgram, provider } = useMemo(() => {
    if (!wallet || !connection) return { program: null, hookProgram: null, provider: null };
    try {
      const prov = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
      const prog = new Program(sssTokenIdl as any, prov);
      const hookProg = new Program(sssTransferHookIdl as any, prov);
      return { program: prog, hookProgram: hookProg, provider: prov };
    } catch {
      return { program: null, hookProgram: null, provider: null };
    }
  }, [wallet, connection]);

  const mintPk = useMemo(() => {
    try {
      return mintAddress ? new PublicKey(mintAddress) : null;
    } catch {
      return null;
    }
  }, [mintAddress]);

  const configPda = useMemo(() => {
    if (!mintPk) return null;
    const [pda] = findConfigPda(mintPk);
    return pda;
  }, [mintPk]);

  // Fetch all on-chain data
  const refresh = useCallback(async () => {
    if (!mintPk || !program || !configPda) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch mint info
      const mintInfo = await getMint(connection, mintPk, "confirmed", TOKEN_2022_PROGRAM_ID);
      setTotalSupply(mintInfo.supply);
      setDecimals(mintInfo.decimals);

      // Fetch config
      const cfg = await (program.account as any).stablecoinConfig.fetch(configPda);
      setConfig(cfg as StablecoinConfig);

      // Try to parse Token-2022 TokenMetadata from mint account extensions.
      // The metadata TLV is appended after the base Mint (82 bytes) + account type
      // discriminator (1 byte) + extension TLVs. Type tag for TokenMetadata = 2 (LE u16).
      try {
        const mintAcct = await connection.getAccountInfo(mintPk);
        if (mintAcct && mintAcct.data && mintAcct.data.length > 166) {
          const buf = mintAcct.data;
          // Scan for TokenMetadata TLV (type = 0x0012 little-endian after the mint account type byte at offset 165)
          let offset = 166; // past base mint (165 bytes for Mint + 1 account-type byte)
          while (offset + 4 <= buf.length) {
            const tlvType = buf.readUInt16LE(offset);
            const tlvLen = buf.readUInt16LE(offset + 2);
            // TokenMetadata extension type tag = 18 (0x12)
            if (tlvType === 18 && tlvLen > 0) {
              // TokenMetadata layout: update_authority (32) + mint (32) + name (borsh string) + symbol (borsh string)
              let pos = offset + 4 + 64; // skip header + update_authority + mint
              if (pos + 4 <= offset + 4 + tlvLen) {
                const nameLen = buf.readUInt32LE(pos);
                pos += 4;
                if (nameLen > 0 && nameLen < 256 && pos + nameLen <= buf.length) {
                  setTokenName(buf.subarray(pos, pos + nameLen).toString("utf-8"));
                  pos += nameLen;
                }
                if (pos + 4 <= buf.length) {
                  const symLen = buf.readUInt32LE(pos);
                  pos += 4;
                  if (symLen > 0 && symLen < 64 && pos + symLen <= buf.length) {
                    setTokenSymbol(buf.subarray(pos, pos + symLen).toString("utf-8"));
                  }
                }
              }
              break;
            }
            offset += 4 + tlvLen;
          }
        }
      } catch {
        // ignore metadata parse failures — name/symbol stay as defaults
      }

      // Fetch user token account if connected
      if (publicKey) {
        try {
          const ata = getAssociatedTokenAddressSync(mintPk, publicKey, true, TOKEN_2022_PROGRAM_ID);
          const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
          setUserTokenAccount({
            balance: account.amount,
            isFrozen: account.isFrozen,
            address: ata,
          });
        } catch {
          setUserTokenAccount(null);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mintPk, program, configPda, connection, publicKey]);

  // Auto-refresh when mint address changes
  useEffect(() => {
    if (mintPk && program) {
      refresh();
    }
  }, [mintPk, program, refresh]);

  // === OPERATIONS ===

  const mint = useCallback(
    async (to: PublicKey, amount: BN): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [minterRole] = findRolePda(configPda, 0, publicKey);
      const sig = await program.methods
        .mint(amount)
        .accountsStrict({
          minter: publicKey,
          config: configPda,
          minterRole,
          mint: mintPk,
          to,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const burn = useCallback(
    async (from: PublicKey, amount: BN): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [burnerRole] = findRolePda(configPda, 1, publicKey);
      const sig = await program.methods
        .burn(amount)
        .accountsStrict({
          burner: publicKey,
          config: configPda,
          burnerRole,
          mint: mintPk,
          from,
          fromAuthority: publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const pause = useCallback(async (): Promise<string> => {
    if (!program || !configPda || !publicKey) throw new Error("Not connected");
    const [pauserRole] = findRolePda(configPda, 2, publicKey);
    const sig = await program.methods
      .pause()
      .accountsStrict({
        pauser: publicKey,
        config: configPda,
        pauserRole,
      })
      .rpc();
    await refresh();
    return sig;
  }, [program, configPda, publicKey, refresh]);

  const unpause = useCallback(async (): Promise<string> => {
    if (!program || !configPda || !publicKey) throw new Error("Not connected");
    const [pauserRole] = findRolePda(configPda, 2, publicKey);
    const sig = await program.methods
      .unpause()
      .accountsStrict({
        pauser: publicKey,
        config: configPda,
        pauserRole,
      })
      .rpc();
    await refresh();
    return sig;
  }, [program, configPda, publicKey, refresh]);

  const freezeAccount = useCallback(
    async (tokenAccount: PublicKey): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [freezerRole] = findRolePda(configPda, 3, publicKey);
      const sig = await program.methods
        .freezeAccount()
        .accountsStrict({
          freezer: publicKey,
          config: configPda,
          freezerRole,
          mint: mintPk,
          tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const thawAccount = useCallback(
    async (tokenAccount: PublicKey): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [freezerRole] = findRolePda(configPda, 3, publicKey);
      const sig = await program.methods
        .thawAccount()
        .accountsStrict({
          freezer: publicKey,
          config: configPda,
          freezerRole,
          mint: mintPk,
          tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const updateRoles = useCallback(
    async (roleType: number, assignee: PublicKey, isActive: boolean): Promise<string> => {
      if (!program || !configPda || !publicKey) throw new Error("Not connected");
      const [rolePda] = findRolePda(configPda, roleType, assignee);
      const roleTypeArg = { [Object.keys(ROLE_NAMES)[roleType].toLowerCase()]: {} };
      const sig = await program.methods
        .updateRoles(roleTypeArg, assignee, isActive)
        .accountsStrict({
          authority: publicKey,
          config: configPda,
          role: rolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, publicKey, refresh]
  );

  const updateMinterQuota = useCallback(
    async (minterRolePda: PublicKey, newQuota: BN): Promise<string> => {
      if (!program || !configPda || !publicKey) throw new Error("Not connected");
      const sig = await program.methods
        .updateMinter(newQuota)
        .accountsStrict({
          authority: publicKey,
          config: configPda,
          minterRole: minterRolePda,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, publicKey, refresh]
  );

  const blacklistAdd = useCallback(
    async (address: PublicKey, reason: string = ""): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [blacklisterRole] = findRolePda(configPda, 4, publicKey);
      const [blacklistEntry] = findBlacklistPda(mintPk, address);
      const sig = await program.methods
        .addToBlacklist(address, reason)
        .accountsStrict({
          blacklister: publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
          blacklistEntry,
          mint: mintPk,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const blacklistRemove = useCallback(
    async (address: PublicKey): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [blacklisterRole] = findRolePda(configPda, 4, publicKey);
      const [blacklistEntry] = findBlacklistPda(mintPk, address);
      const sig = await program.methods
        .removeFromBlacklist(address)
        .accountsStrict({
          blacklister: publicKey,
          config: configPda,
          blacklisterRole,
          hookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
          blacklistEntry,
          mint: mintPk,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, refresh]
  );

  const checkBlacklist = useCallback(
    async (address: PublicKey): Promise<boolean> => {
      if (!mintPk) throw new Error("No mint address");
      const [blacklistEntry] = findBlacklistPda(mintPk, address);
      const account = await connection.getAccountInfo(blacklistEntry);
      return account !== null;
    },
    [mintPk, connection]
  );

  const seize = useCallback(
    async (frozenAccount: PublicKey, treasury: PublicKey): Promise<string> => {
      if (!program || !configPda || !mintPk || !publicKey) throw new Error("Not connected");
      const [seizerRole] = findRolePda(configPda, 5, publicKey);

      const extraAccountMetasSeed = Buffer.from("extra-account-metas");
      const [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
        [extraAccountMetasSeed, mintPk.toBuffer()],
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );

      // Derive blacklist PDAs for from/to owners
      const fromOwnerInfo = await connection.getParsedAccountInfo(frozenAccount);
      const toOwnerInfo = await connection.getParsedAccountInfo(treasury);
      const fromOwnerKey = new PublicKey(
        (fromOwnerInfo?.value?.data as any)?.parsed?.info?.owner ?? PublicKey.default
      );
      const toOwnerKey = new PublicKey(
        (toOwnerInfo?.value?.data as any)?.parsed?.info?.owner ?? PublicKey.default
      );
      const [senderBlacklist] = findBlacklistPda(mintPk, fromOwnerKey);
      const [receiverBlacklist] = findBlacklistPda(mintPk, toOwnerKey);

      const sig = await program.methods
        .seize()
        .accountsStrict({
          authority: publicKey,
          config: configPda,
          seizerRole,
          mint: mintPk,
          from: frozenAccount,
          to: treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: SSS_TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: extraAccountMetasPda, isSigner: false, isWritable: false },
          { pubkey: senderBlacklist, isSigner: false, isWritable: false },
          { pubkey: receiverBlacklist, isSigner: false, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: false },
        ])
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, mintPk, publicKey, connection, refresh]
  );

  const transferAuthority = useCallback(
    async (newAuthority: PublicKey): Promise<string> => {
      if (!program || !configPda || !publicKey) throw new Error("Not connected");
      const sig = await program.methods
        .transferAuthority(newAuthority)
        .accountsStrict({
          authority: publicKey,
          config: configPda,
        })
        .rpc();
      await refresh();
      return sig;
    },
    [program, configPda, publicKey, refresh]
  );

  const acceptAuthority = useCallback(async (): Promise<string> => {
    if (!program || !configPda || !publicKey) throw new Error("Not connected");
    const sig = await program.methods
      .acceptAuthority()
      .accountsStrict({
        newAuthority: publicKey,
        config: configPda,
      })
      .rpc();
    await refresh();
    return sig;
  }, [program, configPda, publicKey, refresh]);

  const cancelAuthorityTransfer = useCallback(async (): Promise<string> => {
    if (!program || !configPda || !publicKey) throw new Error("Not connected");
    const sig = await program.methods
      .cancelAuthorityTransfer()
      .accountsStrict({
        authority: publicKey,
        config: configPda,
      })
      .rpc();
    await refresh();
    return sig;
  }, [program, configPda, publicKey, refresh]);

  // Fetch role info for a specific address + role type
  const fetchRole = useCallback(
    async (roleType: number, assignee: PublicKey): Promise<RoleInfo | null> => {
      if (!program || !configPda) return null;
      const [rolePda] = findRolePda(configPda, roleType, assignee);
      try {
        const role = await (program.account as any).roleAssignment.fetch(rolePda);
        return {
          roleType,
          roleName: ROLE_NAMES[roleType],
          assignee,
          isActive: role.isActive,
          minterQuota: role.minterQuota,
          mintedAmount: role.mintedAmount,
          pda: rolePda,
        };
      } catch {
        return null;
      }
    },
    [program, configPda]
  );

  return {
    // State
    mintAddress,
    setMintAddress,
    config,
    totalSupply,
    decimals,
    tokenName,
    tokenSymbol,
    userTokenAccount,
    loading,
    error,
    connected,
    publicKey,
    configPda,
    mintPk,
    program,

    // Actions
    refresh,
    mint,
    burn,
    pause,
    unpause,
    freezeAccount,
    thawAccount,
    updateRoles,
    updateMinterQuota,
    blacklistAdd,
    blacklistRemove,
    checkBlacklist,
    seize,
    transferAuthority,
    acceptAuthority,
    cancelAuthorityTransfer,
    fetchRole,
  };
}
