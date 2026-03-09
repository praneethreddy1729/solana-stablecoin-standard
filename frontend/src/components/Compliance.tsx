"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { useToast } from "./Toast";

interface ComplianceProps {
  checkBlacklist: (address: PublicKey) => Promise<boolean>;
  blacklistAdd: (address: PublicKey, reason?: string) => Promise<string>;
  blacklistRemove: (address: PublicKey) => Promise<string>;
  freezeAccount: (tokenAccount: PublicKey) => Promise<string>;
  thawAccount: (tokenAccount: PublicKey) => Promise<string>;
  seize: (from: PublicKey, to: PublicKey) => Promise<string>;
  connected: boolean;
  hasTransferHook: boolean;
}

export function Compliance({
  checkBlacklist,
  blacklistAdd,
  blacklistRemove,
  freezeAccount,
  thawAccount,
  seize,
  connected,
  hasTransferHook,
}: ComplianceProps) {
  const toast = useToast();

  // Blacklist check
  const [checkAddr, setCheckAddr] = useState("");
  const [isBlacklisted, setIsBlacklisted] = useState<boolean | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // Add/remove blacklist
  const [blAddr, setBlAddr] = useState("");
  const [blReason, setBlReason] = useState("");
  const [blAddLoading, setBlAddLoading] = useState(false);
  const [blRemoveLoading, setBlRemoveLoading] = useState(false);
  const [blAddConfirm, setBlAddConfirm] = useState(false);
  const [blRemoveConfirm, setBlRemoveConfirm] = useState(false);

  // Freeze/thaw
  const [freezeAddr, setFreezeAddr] = useState("");
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [thawLoading, setThawLoading] = useState(false);

  // Seize
  const [seizeFrom, setSeizeFrom] = useState("");
  const [seizeTo, setSeizeTo] = useState("");
  const [seizeLoading, setSeizeLoading] = useState(false);
  const [seizeConfirm, setSeizeConfirm] = useState(false);

  const handleCheckBlacklist = async () => {
    setCheckLoading(true);
    setIsBlacklisted(null);
    try {
      const addr = new PublicKey(checkAddr);
      const result = await checkBlacklist(addr);
      setIsBlacklisted(result);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckLoading(false);
    }
  };

  const handleBlacklistAdd = async () => {
    if (!blAddConfirm) { setBlAddConfirm(true); return; }
    setBlAddLoading(true);
    try {
      const addr = new PublicKey(blAddr);
      const sig = await blacklistAdd(addr, blReason);
      toast.success("Address added to blacklist", sig);
      setBlAddr("");
      setBlReason("");
      setBlAddConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBlAddLoading(false);
      setBlAddConfirm(false);
    }
  };

  const handleBlacklistRemove = async () => {
    if (!blRemoveConfirm) { setBlRemoveConfirm(true); return; }
    setBlRemoveLoading(true);
    try {
      const addr = new PublicKey(blAddr);
      const sig = await blacklistRemove(addr);
      toast.success("Address removed from blacklist", sig);
      setBlAddr("");
      setBlRemoveConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBlRemoveLoading(false);
      setBlRemoveConfirm(false);
    }
  };

  const handleFreeze = async () => {
    setFreezeLoading(true);
    try {
      const addr = new PublicKey(freezeAddr);
      const sig = await freezeAccount(addr);
      toast.success("Account frozen", sig);
      setFreezeAddr("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleThaw = async () => {
    setThawLoading(true);
    try {
      const addr = new PublicKey(freezeAddr);
      const sig = await thawAccount(addr);
      toast.success("Account thawed", sig);
      setFreezeAddr("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setThawLoading(false);
    }
  };

  const handleSeize = async () => {
    if (!seizeConfirm) { setSeizeConfirm(true); return; }
    setSeizeLoading(true);
    try {
      const from = new PublicKey(seizeFrom);
      const to = new PublicKey(seizeTo);
      const sig = await seize(from, to);
      toast.success("Tokens seized", sig);
      setSeizeFrom("");
      setSeizeTo("");
      setSeizeConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSeizeLoading(false);
      setSeizeConfirm(false);
    }
  };

  if (!connected) {
    return (
      <Card title="Compliance" subtitle="Connect wallet to access compliance tools">
        <div className="text-center py-8 text-text-muted">
          Connect your wallet to access compliance features
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Blacklist Check */}
      <Card title="Blacklist Check" subtitle="Check if an address is on the blacklist">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              label="Address to Check"
              placeholder="Wallet address"
              value={checkAddr}
              onChange={(e) => { setCheckAddr(e.target.value); setIsBlacklisted(null); }}
              mono
            />
          </div>
          <Button
            onClick={handleCheckBlacklist}
            loading={checkLoading}
            disabled={!checkAddr}
            variant="secondary"
            className="h-10"
          >
            Check
          </Button>
        </div>
        {isBlacklisted !== null && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={isBlacklisted ? "danger" : "success"} dot>
              {isBlacklisted ? "BLACKLISTED" : "NOT BLACKLISTED"}
            </Badge>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add/Remove Blacklist */}
        <Card
          title="Manage Blacklist"
          subtitle="Add or remove addresses (requires Blacklister role)"
          headerRight={
            !hasTransferHook ? (
              <Badge variant="warning">SSS-2 only</Badge>
            ) : undefined
          }
        >
          <div className="space-y-3">
            <Input
              label="Address"
              placeholder="Address to blacklist/unblacklist"
              value={blAddr}
              onChange={(e) => { setBlAddr(e.target.value); setBlAddConfirm(false); setBlRemoveConfirm(false); }}
              mono
            />
            <Input
              label="Reason (optional)"
              placeholder="Up to 64 bytes"
              value={blReason}
              onChange={(e) => setBlReason(e.target.value)}
              hint="Only used when adding to blacklist"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleBlacklistAdd}
                loading={blAddLoading}
                disabled={!blAddr}
                variant={blAddConfirm ? "danger" : "primary"}
                size="sm"
              >
                {blAddConfirm ? "Confirm Add" : "Add to Blacklist"}
              </Button>
              <Button
                onClick={handleBlacklistRemove}
                loading={blRemoveLoading}
                disabled={!blAddr}
                variant={blRemoveConfirm ? "success" : "secondary"}
                size="sm"
              >
                {blRemoveConfirm ? "Confirm Remove" : "Remove from Blacklist"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Freeze/Thaw */}
        <Card
          title="Freeze / Thaw"
          subtitle="Freeze or thaw token accounts (requires Freezer role)"
        >
          <div className="space-y-3">
            <Input
              label="Token Account (ATA)"
              placeholder="Token account address"
              value={freezeAddr}
              onChange={(e) => setFreezeAddr(e.target.value)}
              mono
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleFreeze}
                loading={freezeLoading}
                disabled={!freezeAddr}
                variant="danger"
              >
                Freeze Account
              </Button>
              <Button
                onClick={handleThaw}
                loading={thawLoading}
                disabled={!freezeAddr}
                variant="success"
              >
                Thaw Account
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Seize */}
      <Card
        title="Seize Tokens"
        subtitle="Seize tokens from a frozen account (requires Seizer role + SSS-2)"
        headerRight={
          !hasTransferHook ? (
            <Badge variant="warning">SSS-2 only</Badge>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Input
            label="From (frozen token account)"
            placeholder="Source token account"
            value={seizeFrom}
            onChange={(e) => { setSeizeFrom(e.target.value); setSeizeConfirm(false); }}
            mono
          />
          <Input
            label="To (treasury token account)"
            placeholder="Destination token account"
            value={seizeTo}
            onChange={(e) => { setSeizeTo(e.target.value); setSeizeConfirm(false); }}
            mono
          />
        </div>
        <Button
          onClick={handleSeize}
          loading={seizeLoading}
          disabled={!seizeFrom || !seizeTo}
          variant={seizeConfirm ? "danger" : "primary"}
          className="w-full mt-3"
        >
          {seizeConfirm ? "Confirm Seize" : "Seize Tokens"}
        </Button>
        {seizeConfirm && (
          <p className="text-xs text-amber-400 text-center mt-2">
            This will transfer all tokens from the frozen account to the treasury.
            Click again to confirm.
          </p>
        )}
      </Card>
    </div>
  );
}
