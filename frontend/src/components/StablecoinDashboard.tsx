"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  findConfigPda,
  findBlacklistPda,
} from "../../../sdk/core/src/pda";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../../../sdk/core/src/constants";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface MintInfo {
  address: string;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

interface ConfigInfo {
  authority: string;
  paused: boolean;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
}

interface TokenAccountInfo {
  balance: string;
  isFrozen: boolean;
}

export function StablecoinDashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [mintAddress, setMintAddress] = useState("");
  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null);
  const [configInfo, setConfigInfo] = useState<ConfigInfo | null>(null);
  const [tokenAccount, setTokenAccount] = useState<TokenAccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [txResult, setTxResult] = useState<string | null>(null);

  const [blacklistAddress, setBlacklistAddress] = useState("");
  const [blacklistStatus, setBlacklistStatus] = useState<string | null>(null);

  const [screenAddr, setScreenAddr] = useState("");
  const [screenResult, setScreenResult] = useState<any>(null);

  const fetchStatus = useCallback(async () => {
    if (!mintAddress) return;
    setLoading(true);
    setError(null);

    try {
      const mintPk = new PublicKey(mintAddress);
      const mint = await getMint(connection, mintPk, "confirmed", TOKEN_2022_PROGRAM_ID);

      setMintInfo({
        address: mintAddress,
        decimals: mint.decimals,
        supply: mint.supply.toString(),
        mintAuthority: mint.mintAuthority?.toBase58() || null,
        freezeAuthority: mint.freezeAuthority?.toBase58() || null,
      });

      // Use SDK to fetch config via backend status endpoint
      try {
        const res = await fetch(`${BACKEND_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setConfigInfo({
              authority: data.config.authority,
              paused: data.config.paused,
              enableTransferHook: data.config.enableTransferHook,
              enablePermanentDelegate: data.config.enablePermanentDelegate,
            });
          }
        }
      } catch {
        // Fallback: derive configPda and check account existence
        const [configPda] = findConfigPda(mintPk, SSS_TOKEN_PROGRAM_ID);
        const configAccount = await connection.getAccountInfo(configPda, "confirmed");
        if (configAccount) {
          setConfigInfo(null); // Can't parse without SDK program instance in browser
        }
      }

      if (publicKey) {
        try {
          const ata = getAssociatedTokenAddressSync(
            mintPk,
            publicKey,
            true,
            TOKEN_2022_PROGRAM_ID
          );
          const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
          setTokenAccount({
            balance: account.amount.toString(),
            isFrozen: account.isFrozen,
          });
        } catch {
          setTokenAccount(null);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [connection, mintAddress, publicKey]);

  useEffect(() => {
    if (mintAddress) fetchStatus();
  }, [mintAddress, fetchStatus]);

  const handleMint = async () => {
    setTxResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: mintTo, amount: mintAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mint failed");
      setTxResult(`Minted! Signature: ${data.signature}`);
      fetchStatus();
    } catch (err: any) {
      setTxResult(`Error: ${err.message}`);
    }
  };

  const handleBurn = async () => {
    setTxResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/burn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: burnFrom,
          fromAuthority: burnFrom,
          amount: burnAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Burn failed");
      setTxResult(`Burned! Signature: ${data.signature}`);
      fetchStatus();
    } catch (err: any) {
      setTxResult(`Error: ${err.message}`);
    }
  };

  const checkBlacklist = async () => {
    setBlacklistStatus(null);
    try {
      const mintPk = new PublicKey(mintAddress);
      const userPk = new PublicKey(blacklistAddress);
      const [blacklistPda] = findBlacklistPda(mintPk, userPk, SSS_TRANSFER_HOOK_PROGRAM_ID);
      const account = await connection.getAccountInfo(blacklistPda);
      setBlacklistStatus(account ? "BLACKLISTED" : "NOT BLACKLISTED");
    } catch (err: any) {
      setBlacklistStatus(`Error: ${err.message}`);
    }
  };

  const handleScreen = async () => {
    setScreenResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/compliance/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: screenAddr }),
      });
      const data = await res.json();
      setScreenResult(data);
    } catch (err: any) {
      setScreenResult({ error: err.message });
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20, fontFamily: "monospace" }}>
      <h1>Solana Stablecoin Standard</h1>

      {/* Mint Address Input */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2>Token Lookup</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, padding: 8, fontFamily: "monospace", fontSize: 14 }}
            placeholder="Mint address..."
            value={mintAddress}
            onChange={(e) => setMintAddress(e.target.value)}
          />
          <button onClick={fetchStatus} disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </section>

      {/* Token Info */}
      {mintInfo && (
        <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
          <h2>Token Info</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={tdStyle}>Address</td><td style={tdStyle}>{mintInfo.address}</td></tr>
              <tr><td style={tdStyle}>Decimals</td><td style={tdStyle}>{mintInfo.decimals}</td></tr>
              <tr><td style={tdStyle}>Supply</td><td style={tdStyle}>{mintInfo.supply}</td></tr>
              <tr><td style={tdStyle}>Mint Authority</td><td style={tdStyle}>{mintInfo.mintAuthority || "None"}</td></tr>
              <tr><td style={tdStyle}>Freeze Authority</td><td style={tdStyle}>{mintInfo.freezeAuthority || "None"}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Config Info */}
      {configInfo && (
        <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
          <h2>Config</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={tdStyle}>Authority</td><td style={tdStyle}>{configInfo.authority}</td></tr>
              <tr><td style={tdStyle}>Paused</td><td style={tdStyle}>{configInfo.paused ? "YES" : "NO"}</td></tr>
              <tr><td style={tdStyle}>Transfer Hook</td><td style={tdStyle}>{configInfo.enableTransferHook ? "Enabled" : "Disabled"}</td></tr>
              <tr><td style={tdStyle}>Permanent Delegate</td><td style={tdStyle}>{configInfo.enablePermanentDelegate ? "Enabled" : "Disabled"}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Wallet Token Account */}
      {publicKey && tokenAccount && (
        <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
          <h2>Your Token Account</h2>
          <p>Balance: {tokenAccount.balance}</p>
          <p>Frozen: {tokenAccount.isFrozen ? "YES" : "NO"}</p>
        </section>
      )}

      {/* Mint Form */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2>Mint Tokens</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            style={inputStyle}
            placeholder="Recipient address"
            value={mintTo}
            onChange={(e) => setMintTo(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Amount (raw units)"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
          />
          <button onClick={handleMint} style={{ padding: "8px 16px" }}>
            Mint via Backend
          </button>
        </div>
      </section>

      {/* Burn Form */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2>Burn Tokens</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            style={inputStyle}
            placeholder="From address (token holder)"
            value={burnFrom}
            onChange={(e) => setBurnFrom(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Amount (raw units)"
            value={burnAmount}
            onChange={(e) => setBurnAmount(e.target.value)}
          />
          <button onClick={handleBurn} style={{ padding: "8px 16px" }}>
            Burn via Backend
          </button>
        </div>
      </section>

      {txResult && (
        <p style={{ padding: 8, background: "#1a1a2e", borderRadius: 4, wordBreak: "break-all" }}>
          {txResult}
        </p>
      )}

      {/* Blacklist Check (SSS-2) */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2>Blacklist Check (SSS-2)</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, ...inputStyle }}
            placeholder="Address to check"
            value={blacklistAddress}
            onChange={(e) => setBlacklistAddress(e.target.value)}
          />
          <button onClick={checkBlacklist} disabled={!mintAddress} style={{ padding: "8px 16px" }}>
            Check
          </button>
        </div>
        {blacklistStatus && (
          <p style={{
            marginTop: 8,
            color: blacklistStatus === "BLACKLISTED" ? "red" : "green",
            fontWeight: "bold",
          }}>
            {blacklistStatus}
          </p>
        )}
      </section>

      {/* Compliance Screening */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2>Compliance Screening</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, ...inputStyle }}
            placeholder="Address to screen"
            value={screenAddr}
            onChange={(e) => setScreenAddr(e.target.value)}
          />
          <button onClick={handleScreen} style={{ padding: "8px 16px" }}>
            Screen
          </button>
        </div>
        {screenResult && (
          <pre style={{ marginTop: 8, padding: 8, background: "#1a1a2e", borderRadius: 4, overflow: "auto" }}>
            {JSON.stringify(screenResult, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #333",
  wordBreak: "break-all",
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  fontFamily: "monospace",
  fontSize: 14,
};
