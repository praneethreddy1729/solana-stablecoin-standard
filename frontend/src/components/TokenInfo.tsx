"use client";

import React from "react";
import { PublicKey } from "@solana/web3.js";
import { Card, CardSkeleton } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { explorerUrl, shortenAddress, formatNumber } from "@/lib/constants";
import type { StablecoinConfig, TokenAccountInfo } from "@/hooks/useStablecoin";

interface TokenInfoProps {
  mintAddress: string;
  config: StablecoinConfig | null;
  totalSupply: bigint | null;
  decimals: number;
  userTokenAccount: TokenAccountInfo | null;
  loading: boolean;
}

function formatSupply(supply: bigint, decimals: number): string {
  return formatNumber(supply, decimals);
}

export function TokenInfo({
  mintAddress,
  config,
  totalSupply,
  decimals,
  userTokenAccount,
  loading,
}: TokenInfoProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSkeleton className="lg:col-span-2" lines={4} />
        <CardSkeleton lines={2} />
      </div>
    );
  }

  if (!config) return null;

  const isAuthPending =
    config.pendingAuthority && !config.pendingAuthority.equals(PublicKey.default);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Main Token Info */}
      <Card className="lg:col-span-2" title="Token Overview">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Mint Address">
            <a
              href={explorerUrl(mintAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors break-all"
            >
              {mintAddress}
            </a>
          </InfoRow>
          <InfoRow label="Decimals">
            <span className="text-text-primary font-medium">{decimals}</span>
          </InfoRow>
          <InfoRow label="Total Supply">
            <span className="text-text-primary font-medium text-lg number-appear font-mono">
              {totalSupply !== null ? formatSupply(totalSupply, decimals) : "--"}
            </span>
          </InfoRow>
          <InfoRow label="Status">
            <div className="flex items-center gap-2">
              <Badge variant={config.paused ? "danger" : "success"} dot>
                {config.paused ? "Paused" : "Active"}
              </Badge>
              {config.enableTransferHook && (
                <Badge variant="info">Transfer Hook</Badge>
              )}
              {config.enablePermanentDelegate && (
                <Badge variant="warning">Permanent Delegate</Badge>
              )}
            </div>
          </InfoRow>
          <InfoRow label="Authority">
            <a
              href={explorerUrl(config.authority.toBase58())}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {shortenAddress(config.authority.toBase58(), 6)}
            </a>
          </InfoRow>
          {isAuthPending && (
            <InfoRow label="Pending Authority">
              <div className="flex items-center gap-2">
                <a
                  href={explorerUrl(config.pendingAuthority.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {shortenAddress(config.pendingAuthority.toBase58(), 6)}
                </a>
                <Badge variant="warning" dot>
                  Transfer Pending
                </Badge>
              </div>
            </InfoRow>
          )}
        </div>
      </Card>

      {/* Your Account Card */}
      <Card title="Your Account">
        {userTokenAccount ? (
          <div className="space-y-4">
            <InfoRow label="Balance">
              <span className="text-2xl font-semibold text-text-primary number-appear font-mono">
                {formatSupply(userTokenAccount.balance, decimals)}
              </span>
            </InfoRow>
            <InfoRow label="Account Status">
              <Badge
                variant={userTokenAccount.isFrozen ? "danger" : "success"}
                dot
              >
                {userTokenAccount.isFrozen ? "Frozen" : "Active"}
              </Badge>
            </InfoRow>
            <InfoRow label="Token Account">
              <a
                href={explorerUrl(userTokenAccount.address.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {shortenAddress(userTokenAccount.address.toBase58(), 6)}
              </a>
            </InfoRow>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-text-muted text-sm">No token account found</p>
            <p className="text-text-muted text-xs mt-1">
              You don&apos;t hold any of this token yet
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}
