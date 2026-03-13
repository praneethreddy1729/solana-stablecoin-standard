"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { explorerUrl, shortenAddress } from "@/lib/constants";

export interface TransactionRecord {
  id: string;
  type: "mint" | "burn" | "freeze" | "thaw" | "pause" | "unpause" | "blacklist_add" | "blacklist_remove" | "seize" | "role_assign" | "role_revoke" | "authority_transfer" | "attestation";
  description: string;
  amount?: string;
  signature: string;
  timestamp: number;
}

interface TransactionHistoryContextValue {
  transactions: TransactionRecord[];
  addTransaction: (tx: Omit<TransactionRecord, "id" | "timestamp">) => void;
}

const TransactionHistoryContext = createContext<TransactionHistoryContextValue>({
  transactions: [],
  addTransaction: () => {},
});

export function useTransactionHistory() {
  return useContext(TransactionHistoryContext);
}

export function TransactionHistoryProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  const addTransaction = useCallback(
    (tx: Omit<TransactionRecord, "id" | "timestamp">) => {
      const record: TransactionRecord = {
        ...tx,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      setTransactions((prev) => [record, ...prev].slice(0, 10));
    },
    []
  );

  return (
    <TransactionHistoryContext.Provider value={{ transactions, addTransaction }}>
      {children}
    </TransactionHistoryContext.Provider>
  );
}

const TYPE_LABELS: Record<TransactionRecord["type"], string> = {
  mint: "Mint",
  burn: "Burn",
  freeze: "Freeze",
  thaw: "Thaw",
  pause: "Pause",
  unpause: "Unpause",
  blacklist_add: "Blacklist",
  blacklist_remove: "Unblacklist",
  seize: "Seize",
  role_assign: "Assign Role",
  role_revoke: "Revoke Role",
  authority_transfer: "Authority",
  attestation: "Attestation",
};

const TYPE_VARIANTS: Record<TransactionRecord["type"], "success" | "danger" | "warning" | "info" | "neutral"> = {
  mint: "success",
  burn: "danger",
  freeze: "danger",
  thaw: "success",
  pause: "warning",
  unpause: "success",
  blacklist_add: "danger",
  blacklist_remove: "success",
  seize: "danger",
  role_assign: "info",
  role_revoke: "warning",
  authority_transfer: "info",
  attestation: "info",
};

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TransactionHistory() {
  const { transactions } = useTransactionHistory();

  return (
    <Card
      title="Transaction History"
      subtitle="Recent transactions from this session"
      headerRight={
        transactions.length > 0 ? (
          <Badge variant="neutral">{transactions.length}</Badge>
        ) : undefined
      }
    >
      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-navy-800 border border-border flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">No transactions yet</p>
          <p className="text-text-muted text-xs mt-1">
            Transactions made during this session will appear here
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto scroll-hint -mx-5">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] text-text-muted uppercase tracking-wider font-medium px-5 py-2">
                  Type
                </th>
                <th className="text-left text-[11px] text-text-muted uppercase tracking-wider font-medium px-3 py-2">
                  Description
                </th>
                <th className="text-left text-[11px] text-text-muted uppercase tracking-wider font-medium px-3 py-2">
                  Time
                </th>
                <th className="text-right text-[11px] text-text-muted uppercase tracking-wider font-medium px-5 py-2">
                  Signature
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-border/50 last:border-0 tab-content-enter"
                >
                  <td className="px-5 py-3">
                    <Badge variant={TYPE_VARIANTS[tx.type]}>
                      {TYPE_LABELS[tx.type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm text-text-secondary">{tx.description}</span>
                    {tx.amount && (
                      <span className="text-sm text-text-primary font-medium ml-1">
                        {tx.amount}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-text-muted font-mono">
                      {formatTime(tx.timestamp)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={explorerUrl(tx.signature, "tx")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {shortenAddress(tx.signature, 4)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
