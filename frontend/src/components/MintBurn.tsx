"use client";

import React, { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useToast } from "./Toast";
import { useTransactionHistory } from "./TransactionHistory";

interface MintBurnProps {
  mint: (to: PublicKey, amount: BN) => Promise<string>;
  burn: (from: PublicKey, amount: BN) => Promise<string>;
  pause: () => Promise<string>;
  unpause: () => Promise<string>;
  paused: boolean;
  decimals: number;
  mintPk: PublicKey | null;
  connected: boolean;
}

export function MintBurn({
  mint,
  burn,
  pause,
  unpause,
  paused,
  decimals,
  mintPk,
  connected,
}: MintBurnProps) {
  const toast = useToast();
  const { addTransaction } = useTransactionHistory();

  // Mint form
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [mintLoading, setMintLoading] = useState(false);
  const [mintConfirm, setMintConfirm] = useState(false);

  // Burn form
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [burnLoading, setBurnLoading] = useState(false);
  const [burnConfirm, setBurnConfirm] = useState(false);

  // Pause
  const [pauseLoading, setPauseLoading] = useState(false);

  const toRawAmount = useCallback(
    (humanAmount: string): BN => {
      const parts = humanAmount.split(".");
      const whole = parts[0] || "0";
      let frac = parts[1] || "";
      frac = frac.padEnd(decimals, "0").slice(0, decimals);
      return new BN(whole + frac);
    },
    [decimals]
  );

  const handleMint = async () => {
    if (!mintConfirm) {
      setMintConfirm(true);
      return;
    }
    setMintLoading(true);
    try {
      const recipientPk = new PublicKey(mintTo);
      // Get ATA for the recipient
      const ata = getAssociatedTokenAddressSync(mintPk!, recipientPk, true, TOKEN_2022_PROGRAM_ID);
      const amount = toRawAmount(mintAmount);
      const sig = await mint(ata, amount);
      toast.success(`Minted ${mintAmount} tokens`, sig);
      addTransaction({ type: "mint", description: `Minted ${mintAmount} tokens`, amount: mintAmount, signature: sig });
      setMintTo("");
      setMintAmount("");
      setMintConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setMintLoading(false);
      setMintConfirm(false);
    }
  };

  const handleBurn = async () => {
    if (!burnConfirm) {
      setBurnConfirm(true);
      return;
    }
    setBurnLoading(true);
    try {
      const fromPk = new PublicKey(burnFrom);
      const amount = toRawAmount(burnAmount);
      const sig = await burn(fromPk, amount);
      toast.success(`Burned ${burnAmount} tokens`, sig);
      addTransaction({ type: "burn", description: `Burned ${burnAmount} tokens`, amount: burnAmount, signature: sig });
      setBurnFrom("");
      setBurnAmount("");
      setBurnConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBurnLoading(false);
      setBurnConfirm(false);
    }
  };

  const handlePauseToggle = async () => {
    setPauseLoading(true);
    try {
      const sig = paused ? await unpause() : await pause();
      toast.success(paused ? "Token unpaused" : "Token paused", sig);
      addTransaction({ type: paused ? "unpause" : "pause", description: paused ? "Token unpaused" : "Token paused", signature: sig });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPauseLoading(false);
    }
  };

  if (!connected) {
    return (
      <Card title="Token Operations" subtitle="Connect wallet to perform operations">
        <div className="text-center py-8 text-text-muted">
          Connect your wallet to mint, burn, or manage tokens
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Mint Card */}
      <Card title="Mint Tokens" subtitle="Create new tokens (requires Minter role)">
        <div className="space-y-3">
          <Input
            label="Recipient Address"
            placeholder="Wallet address (owner, not ATA)"
            value={mintTo}
            onChange={(e) => { setMintTo(e.target.value); setMintConfirm(false); }}
            mono
          />
          <Input
            label="Amount"
            placeholder="e.g., 1000.00"
            type="number"
            step="any"
            value={mintAmount}
            onChange={(e) => { setMintAmount(e.target.value); setMintConfirm(false); }}
            hint={`Will be converted to raw amount with ${decimals} decimals`}
          />
          <Button
            onClick={handleMint}
            loading={mintLoading}
            disabled={!mintTo || !mintAmount}
            variant={mintConfirm ? "success" : "primary"}
            className="w-full"
          >
            {mintConfirm ? "Confirm Mint" : "Mint Tokens"}
          </Button>
          {mintConfirm && (
            <p className="text-xs text-amber-400 text-center">
              Click again to confirm minting {mintAmount} tokens
            </p>
          )}
        </div>
      </Card>

      {/* Burn Card */}
      <Card title="Burn Tokens" subtitle="Destroy tokens (requires Burner role)">
        <div className="space-y-3">
          <Input
            label="Token Account (ATA)"
            placeholder="Token account address to burn from"
            value={burnFrom}
            onChange={(e) => { setBurnFrom(e.target.value); setBurnConfirm(false); }}
            mono
          />
          <Input
            label="Amount"
            placeholder="e.g., 500.00"
            type="number"
            step="any"
            value={burnAmount}
            onChange={(e) => { setBurnAmount(e.target.value); setBurnConfirm(false); }}
            hint={`Will be converted to raw amount with ${decimals} decimals`}
          />
          <Button
            onClick={handleBurn}
            loading={burnLoading}
            disabled={!burnFrom || !burnAmount}
            variant={burnConfirm ? "danger" : "primary"}
            className="w-full"
          >
            {burnConfirm ? "Confirm Burn" : "Burn Tokens"}
          </Button>
          {burnConfirm && (
            <p className="text-xs text-amber-400 text-center">
              Click again to confirm burning {burnAmount} tokens
            </p>
          )}
        </div>
      </Card>

      {/* Pause/Unpause */}
      <Card
        title="Pause Control"
        subtitle="Pause or unpause all token operations (requires Pauser role)"
        className="lg:col-span-2"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">
              Current status:{" "}
              <span className={paused ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                {paused ? "PAUSED" : "ACTIVE"}
              </span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              {paused
                ? "All token operations are currently halted"
                : "Token operations are functioning normally"}
            </p>
          </div>
          <Button
            onClick={handlePauseToggle}
            loading={pauseLoading}
            variant={paused ? "success" : "danger"}
            size="lg"
          >
            {paused ? "Unpause Token" : "Pause Token"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
