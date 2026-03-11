"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { useToast } from "./Toast";
import { useTransactionHistory } from "./TransactionHistory";
import { shortenAddress, explorerUrl } from "@/lib/constants";

interface AuthorityTransferProps {
  authority: PublicKey | null;
  pendingAuthority: PublicKey | null;
  transferAuthority: (newAuthority: PublicKey) => Promise<string>;
  acceptAuthority: () => Promise<string>;
  cancelAuthorityTransfer: () => Promise<string>;
  connected: boolean;
  publicKey: PublicKey | null;
}

export function AuthorityTransfer({
  authority,
  pendingAuthority,
  transferAuthority,
  acceptAuthority,
  cancelAuthorityTransfer,
  connected,
  publicKey,
}: AuthorityTransferProps) {
  const toast = useToast();
  const { addTransaction } = useTransactionHistory();

  const [newAuth, setNewAuth] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isAuthority = authority && publicKey ? authority.equals(publicKey) : false;
  const isPendingAuth =
    pendingAuthority &&
    publicKey &&
    !pendingAuthority.equals(PublicKey.default) &&
    pendingAuthority.equals(publicKey);
  const hasTransferPending =
    pendingAuthority && !pendingAuthority.equals(PublicKey.default);

  const handleTransfer = async () => {
    if (!transferConfirm) {
      setTransferConfirm(true);
      return;
    }
    setTransferLoading(true);
    try {
      const newAuthPk = new PublicKey(newAuth);
      const sig = await transferAuthority(newAuthPk);
      toast.success("Authority transfer initiated", sig);
      addTransaction({ type: "authority_transfer", description: "Authority transfer initiated", signature: sig });
      setNewAuth("");
      setTransferConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTransferLoading(false);
      setTransferConfirm(false);
    }
  };

  const handleAccept = async () => {
    setAcceptLoading(true);
    try {
      const sig = await acceptAuthority();
      toast.success("Authority transfer accepted", sig);
      addTransaction({ type: "authority_transfer", description: "Authority transfer accepted", signature: sig });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const sig = await cancelAuthorityTransfer();
      toast.success("Authority transfer cancelled", sig);
      addTransaction({ type: "authority_transfer", description: "Authority transfer cancelled", signature: sig });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelLoading(false);
    }
  };

  if (!connected) {
    return (
      <Card title="Authority" subtitle="Connect wallet to manage authority">
        <div className="text-center py-8 text-text-muted">
          Connect your wallet to manage authority
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Authority Status */}
      <Card title="Authority Status">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-navy-900 border border-border">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
                Current Authority
              </p>
              {authority && (
                <a
                  href={explorerUrl(authority.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {authority.toBase58()}
                </a>
              )}
            </div>
            {isAuthority && (
              <Badge variant="success" dot>
                You
              </Badge>
            )}
          </div>

          {hasTransferPending && pendingAuthority && (
            <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div>
                <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">
                  Pending Authority Transfer
                </p>
                <a
                  href={explorerUrl(pendingAuthority.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {pendingAuthority.toBase58()}
                </a>
              </div>
              <div className="flex items-center gap-2">
                {isPendingAuth && (
                  <Badge variant="warning" dot>
                    You
                  </Badge>
                )}
                <Badge variant="warning">Pending</Badge>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Initiate Transfer */}
        <Card
          title="Initiate Transfer"
          subtitle="Start a two-step authority transfer (current authority only)"
        >
          <div className="space-y-3">
            <Input
              label="New Authority Address"
              placeholder="Wallet address of the new authority"
              value={newAuth}
              onChange={(e) => { setNewAuth(e.target.value); setTransferConfirm(false); }}
              mono
            />
            <Button
              onClick={handleTransfer}
              loading={transferLoading}
              disabled={!newAuth || !isAuthority}
              variant={transferConfirm ? "danger" : "primary"}
              className="w-full"
            >
              {transferConfirm ? "Confirm Transfer" : "Initiate Authority Transfer"}
            </Button>
            {transferConfirm && (
              <p className="text-xs text-amber-400 text-center">
                This will initiate authority transfer. The new authority must accept it.
                Click again to confirm.
              </p>
            )}
            {!isAuthority && (
              <p className="text-xs text-text-muted text-center">
                Only the current authority can initiate a transfer
              </p>
            )}
          </div>
        </Card>

        {/* Accept/Cancel */}
        <Card
          title="Complete Transfer"
          subtitle="Accept or cancel a pending authority transfer"
        >
          <div className="space-y-4">
            {hasTransferPending ? (
              <>
                {isPendingAuth && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      You are the pending authority. Accept to complete the transfer.
                    </p>
                    <Button
                      onClick={handleAccept}
                      loading={acceptLoading}
                      variant="success"
                      className="w-full"
                    >
                      Accept Authority
                    </Button>
                  </div>
                )}
                {isAuthority && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      Cancel the pending authority transfer.
                    </p>
                    <Button
                      onClick={handleCancel}
                      loading={cancelLoading}
                      variant="danger"
                      className="w-full"
                    >
                      Cancel Transfer
                    </Button>
                  </div>
                )}
                {!isPendingAuth && !isAuthority && (
                  <p className="text-sm text-text-muted text-center py-4">
                    You are neither the current nor pending authority
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-text-muted text-sm">No pending authority transfer</p>
                <p className="text-text-muted text-xs mt-1">
                  Initiate a transfer from the left panel
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
