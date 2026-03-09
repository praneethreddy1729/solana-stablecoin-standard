"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useStablecoin } from "@/hooks/useStablecoin";
import { TokenInfo } from "./TokenInfo";
import { MintBurn } from "./MintBurn";
import { RoleManager } from "./RoleManager";
import { Compliance } from "./Compliance";
import { AuthorityTransfer } from "./AuthorityTransfer";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "operations", label: "Operations" },
  { id: "roles", label: "Roles" },
  { id: "compliance", label: "Compliance" },
  { id: "authority", label: "Authority" },
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

      {/* Tab Navigation */}
      {loaded && (
        <>
          <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
                  cursor-pointer border-b-2 -mb-px
                  ${
                    activeTab === tab.id
                      ? "text-cyan-400 border-cyan-400"
                      : "text-text-muted border-transparent hover:text-text-secondary hover:border-navy-600"
                  }
                `}
              >
                {tab.label}
                {tab.id === "compliance" && sc.config?.enableTransferHook && (
                  <Badge variant="info" className="ml-2 !py-0 !px-1.5 !text-[10px]">
                    SSS-2
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
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
                  className="p-3 rounded-lg bg-surface border border-border text-center"
                >
                  <p className="text-xs text-text-muted">{feature}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
