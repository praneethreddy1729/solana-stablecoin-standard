"use client";

import React from "react";
import { Badge } from "./ui/Badge";
import { formatNumber } from "@/lib/constants";
import type { StablecoinConfig } from "@/hooks/useStablecoin";

interface StatCardsProps {
  config: StablecoinConfig;
  totalSupply: bigint | null;
  decimals: number;
}

export function StatCards({ config, totalSupply, decimals }: StatCardsProps) {
  const roleTypes = 7;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* Total Supply */}
      <div className="stat-card card-hover bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Total Supply</p>
        <p className="text-lg font-semibold text-text-primary number-appear font-mono">
          {totalSupply !== null ? formatNumber(totalSupply, decimals) : "--"}
        </p>
      </div>

      {/* Collateralization */}
      <div className="stat-card card-hover bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>
        <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Collateral Ratio</p>
        <p className="text-lg font-semibold text-text-muted number-appear">
          --
        </p>
        <p className="text-[10px] text-text-muted mt-1">Submit attestation to view</p>
      </div>

      {/* Role Types */}
      <div className="stat-card card-hover bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2.228 2.228 0 013 16.9c0-2.86 2.17-5.192 4.903-5.349a5.002 5.002 0 019.194 0 5.382 5.382 0 012.403 2.519M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
        </div>
        <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Role Types</p>
        <p className="text-lg font-semibold text-text-primary number-appear">
          {roleTypes}
        </p>
        <p className="text-[10px] text-text-muted mt-1">Available role categories</p>
      </div>

      {/* Pause Status */}
      <div className="stat-card card-hover bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${config.paused ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
            {config.paused ? (
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            )}
          </div>
        </div>
        <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">System Status</p>
        <div className="flex items-center gap-2">
          <Badge variant={config.paused ? "danger" : "success"} dot>
            {config.paused ? "Paused" : "Active"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
