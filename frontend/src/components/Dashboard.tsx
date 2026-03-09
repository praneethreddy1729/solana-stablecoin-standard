"use client";

import React, { useState } from "react";
import { useStablecoin } from "@/hooks/useStablecoin";
import { TokenInfo } from "./TokenInfo";
import { MintBurn } from "./MintBurn";
import { RoleManager } from "./RoleManager";
import { Compliance } from "./Compliance";
import { AuthorityTransfer } from "./AuthorityTransfer";
import { Attestation } from "./Attestation";
import { StatCards } from "./StatCards";
import { TransactionHistory } from "./TransactionHistory";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

const TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    id: "operations",
    label: "Operations",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "roles",
    label: "Roles",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2.228 2.228 0 013 16.9c0-2.86 2.17-5.192 4.903-5.349a5.002 5.002 0 019.194 0 5.382 5.382 0 012.403 2.519" />
      </svg>
    ),
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    id: "attestation",
    label: "Attestation",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
  {
    id: "authority",
    label: "Authority",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Dashboard() {
  const sc = useStablecoin();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const isAuthority =
    sc.config && sc.publicKey ? sc.config.authority.equals(sc.publicKey) : false;

  const loaded = sc.config !== null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
      {/* Mint Address Input */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              placeholder="Enter mint address to load stablecoin..."
              value={sc.mintAddress}
              onChange={(e) => sc.setMintAddress(e.target.value)}
              mono
            />
          </div>
          <Button
            onClick={sc.refresh}
            loading={sc.loading}
            disabled={!sc.mintAddress}
            variant="primary"
          >
            Load
          </Button>
        </div>
        {sc.error && (
          <p className="text-sm text-red-400 mt-2">{sc.error}</p>
        )}
      </div>

      {/* Stat Cards */}
      {loaded && sc.config && (
        <StatCards
          config={sc.config}
          totalSupply={sc.totalSupply}
          decimals={sc.decimals}
        />
      )}

      {/* Tab Navigation */}
      {loaded && (
        <>
          <div className="flex items-center gap-0.5 border-b border-border mb-6 overflow-x-auto scroll-hint">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                  cursor-pointer border-b-2 -mb-px transition-all duration-200 min-h-[44px]
                  ${
                    activeTab === tab.id
                      ? "text-cyan-400 border-cyan-400"
                      : "text-text-muted border-transparent hover:text-text-secondary hover:border-navy-600"
                  }
                `}
              >
                <span className={activeTab === tab.id ? "text-cyan-400" : "text-text-muted"}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.id === "compliance" && sc.config?.enableTransferHook && (
                  <Badge variant="info" className="!py-0 !px-1.5 !text-[10px]">
                    SSS-2
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content with Animation */}
          <div className="tab-content-enter" key={activeTab}>
            {activeTab === "overview" && (
              <TokenInfo
                mintAddress={sc.mintAddress}
                config={sc.config}
                totalSupply={sc.totalSupply}
                decimals={sc.decimals}
                userTokenAccount={sc.userTokenAccount}
                loading={sc.loading}
              />
            )}

            {activeTab === "operations" && (
              <MintBurn
                mint={sc.mint}
                burn={sc.burn}
                pause={sc.pause}
                unpause={sc.unpause}
                paused={sc.config?.paused ?? false}
                decimals={sc.decimals}
                mintPk={sc.mintPk}
                connected={sc.connected}
              />
            )}

            {activeTab === "roles" && (
              <RoleManager
                updateRoles={sc.updateRoles}
                updateMinterQuota={sc.updateMinterQuota}
                fetchRole={sc.fetchRole}
                connected={sc.connected}
                isAuthority={isAuthority}
              />
            )}

            {activeTab === "compliance" && (
              <Compliance
                checkBlacklist={sc.checkBlacklist}
                blacklistAdd={sc.blacklistAdd}
                blacklistRemove={sc.blacklistRemove}
                freezeAccount={sc.freezeAccount}
                thawAccount={sc.thawAccount}
                seize={sc.seize}
                connected={sc.connected}
                hasTransferHook={sc.config?.enableTransferHook ?? false}
              />
            )}

            {activeTab === "attestation" && (
              <Attestation
                connected={sc.connected}
                totalSupply={sc.totalSupply}
                decimals={sc.decimals}
              />
            )}

            {activeTab === "authority" && (
              <AuthorityTransfer
                authority={sc.config?.authority ?? null}
                pendingAuthority={sc.config?.pendingAuthority ?? null}
                transferAuthority={sc.transferAuthority}
                acceptAuthority={sc.acceptAuthority}
                cancelAuthorityTransfer={sc.cancelAuthorityTransfer}
                connected={sc.connected}
                publicKey={sc.publicKey}
              />
            )}
          </div>

          {/* Transaction History - always visible at bottom */}
          <div className="mt-6">
            <TransactionHistory />
          </div>
        </>
      )}

      {/* Empty State */}
      {!loaded && !sc.loading && (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-navy-800 border border-border flex items-center justify-center">
            <svg
              className="w-8 h-8 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Solana Stablecoin Standard
          </h2>
          <p className="text-text-muted max-w-md mx-auto">
            Enter a mint address above to load and manage a stablecoin.
            Connect your wallet to perform on-chain operations.
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
            {["Mint & Burn", "Role-Based Access", "Compliance", "Authority"].map(
              (feature) => (
                <div
                  key={feature}
                  className="card-hover p-3 rounded-lg bg-surface border border-border text-center"
                >
                  <p className="text-xs text-text-muted">{feature}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {sc.loading && !loaded && (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="spinner w-10 h-10 mb-4" />
          <p className="text-text-muted text-sm">Loading stablecoin data...</p>
        </div>
      )}
    </div>
  );
}
