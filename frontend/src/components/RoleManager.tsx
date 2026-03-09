"use client";

import React, { useState, useCallback, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input, Select } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { useToast } from "./Toast";
import { ROLE_NAMES, ROLE_DESCRIPTIONS, shortenAddress, explorerUrl } from "@/lib/constants";
import type { RoleInfo } from "@/hooks/useStablecoin";

interface RoleManagerProps {
  updateRoles: (roleType: number, assignee: PublicKey, isActive: boolean) => Promise<string>;
  updateMinterQuota: (minterRolePda: PublicKey, newQuota: BN) => Promise<string>;
  fetchRole: (roleType: number, assignee: PublicKey) => Promise<RoleInfo | null>;
  connected: boolean;
  isAuthority: boolean;
}

export function RoleManager({
  updateRoles,
  updateMinterQuota,
  fetchRole,
  connected,
  isAuthority,
}: RoleManagerProps) {
  const toast = useToast();

  // Assign role form
  const [roleType, setRoleType] = useState("0");
  const [assignee, setAssignee] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignConfirm, setAssignConfirm] = useState(false);

  // Query role
  const [queryRoleType, setQueryRoleType] = useState("0");
  const [queryAddress, setQueryAddress] = useState("");
  const [queriedRole, setQueriedRole] = useState<RoleInfo | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryNotFound, setQueryNotFound] = useState(false);

  // Minter quota
  const [quotaMinterPda, setQuotaMinterPda] = useState("");
  const [newQuota, setNewQuota] = useState("");
  const [quotaLoading, setQuotaLoading] = useState(false);

  const roleOptions = Object.entries(ROLE_NAMES).map(([value, label]) => ({
    value,
    label,
  }));

  const handleAssignRole = async () => {
    if (!assignConfirm) {
      setAssignConfirm(true);
      return;
    }
    setAssignLoading(true);
    try {
      const assigneePk = new PublicKey(assignee);
      const sig = await updateRoles(parseInt(roleType), assigneePk, isActive);
      toast.success(
        `${isActive ? "Assigned" : "Revoked"} ${ROLE_NAMES[parseInt(roleType)]} role`,
        sig
      );
      setAssignee("");
      setAssignConfirm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAssignLoading(false);
      setAssignConfirm(false);
    }
  };

  const handleQueryRole = async () => {
    setQueryLoading(true);
    setQueryNotFound(false);
    setQueriedRole(null);
    try {
      const addr = new PublicKey(queryAddress);
      const role = await fetchRole(parseInt(queryRoleType), addr);
      if (role) {
        setQueriedRole(role);
      } else {
        setQueryNotFound(true);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setQueryLoading(false);
    }
  };

  const handleUpdateQuota = async () => {
    setQuotaLoading(true);
    try {
      const pdaPk = new PublicKey(quotaMinterPda);
      const quota = new BN(newQuota);
      const sig = await updateMinterQuota(pdaPk, quota);
      toast.success("Minter quota updated", sig);
      setNewQuota("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setQuotaLoading(false);
    }
  };

  if (!connected) {
    return (
      <Card title="Role Management" subtitle="Connect wallet to manage roles">
        <div className="text-center py-8 text-text-muted">
          Connect your wallet to manage roles
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Role Overview */}
      <Card title="Role Types" subtitle="6 role types control different stablecoin operations">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ROLE_NAMES).map(([type, name]) => (
            <div
              key={type}
              className="p-3 rounded-lg bg-navy-900 border border-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-text-primary">{name}</span>
                <Badge variant="info">{type}</Badge>
              </div>
              <p className="text-xs text-text-muted">{ROLE_DESCRIPTIONS[parseInt(type)]}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assign/Revoke Role */}
        <Card
          title="Assign / Revoke Role"
          subtitle={isAuthority ? "Authority only" : "Requires authority role"}
        >
          <div className="space-y-3">
            <Select
              label="Role Type"
              options={roleOptions}
              value={roleType}
              onChange={(e) => { setRoleType(e.target.value); setAssignConfirm(false); }}
            />
            <Input
              label="Assignee Address"
              placeholder="Wallet address"
              value={assignee}
              onChange={(e) => { setAssignee(e.target.value); setAssignConfirm(false); }}
              mono
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-text-secondary">Action:</label>
              <button
                onClick={() => { setIsActive(true); setAssignConfirm(false); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-navy-900 text-text-muted border border-border"
                }`}
              >
                Assign
              </button>
              <button
                onClick={() => { setIsActive(false); setAssignConfirm(false); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  !isActive
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-navy-900 text-text-muted border border-border"
                }`}
              >
                Revoke
              </button>
            </div>
            <Button
              onClick={handleAssignRole}
              loading={assignLoading}
              disabled={!assignee || !isAuthority}
              variant={assignConfirm ? (isActive ? "success" : "danger") : "primary"}
              className="w-full"
            >
              {assignConfirm
                ? `Confirm ${isActive ? "Assign" : "Revoke"}`
                : `${isActive ? "Assign" : "Revoke"} ${ROLE_NAMES[parseInt(roleType)]} Role`}
            </Button>
            {assignConfirm && (
              <p className="text-xs text-amber-400 text-center">
                Click again to confirm {isActive ? "assigning" : "revoking"}{" "}
                {ROLE_NAMES[parseInt(roleType)]} role
              </p>
            )}
            {!isAuthority && (
              <p className="text-xs text-red-400 text-center">
                Only the token authority can assign or revoke roles
              </p>
            )}
          </div>
        </Card>

        {/* Query Role */}
        <Card title="Lookup Role" subtitle="Check if an address holds a specific role">
          <div className="space-y-3">
            <Select
              label="Role Type"
              options={roleOptions}
              value={queryRoleType}
              onChange={(e) => setQueryRoleType(e.target.value)}
            />
            <Input
              label="Address"
              placeholder="Wallet address to check"
              value={queryAddress}
              onChange={(e) => { setQueryAddress(e.target.value); setQueryNotFound(false); setQueriedRole(null); }}
              mono
            />
            <Button
              onClick={handleQueryRole}
              loading={queryLoading}
              disabled={!queryAddress}
              variant="secondary"
              className="w-full"
            >
              Lookup Role
            </Button>

            {queriedRole && (
              <div className="mt-3 p-3 rounded-lg bg-navy-900 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{queriedRole.roleName}</span>
                  <Badge variant={queriedRole.isActive ? "success" : "danger"} dot>
                    {queriedRole.isActive ? "Active" : "Revoked"}
                  </Badge>
                </div>
                <div className="text-xs text-text-muted">
                  <p>
                    PDA:{" "}
                    <a
                      href={explorerUrl(queriedRole.pda.toBase58())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      {shortenAddress(queriedRole.pda.toBase58(), 6)}
                    </a>
                  </p>
                  {queriedRole.roleType === 0 && (
                    <>
                      <p className="mt-1">
                        Quota: {queriedRole.minterQuota.toString()}
                      </p>
                      <p>
                        Minted: {queriedRole.mintedAmount.toString()}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {queryNotFound && (
              <div className="mt-3 p-3 rounded-lg bg-navy-900 border border-border text-center">
                <p className="text-sm text-text-muted">No role assignment found</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Minter Quota */}
      <Card
        title="Update Minter Quota"
        subtitle="Set maximum mintable amount for a minter (authority only)"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Input
            label="Minter Role PDA"
            placeholder="Role PDA address"
            value={quotaMinterPda}
            onChange={(e) => setQuotaMinterPda(e.target.value)}
            mono
          />
          <Input
            label="New Quota (raw units)"
            placeholder="e.g., 1000000000"
            value={newQuota}
            onChange={(e) => setNewQuota(e.target.value)}
          />
          <Button
            onClick={handleUpdateQuota}
            loading={quotaLoading}
            disabled={!quotaMinterPda || !newQuota || !isAuthority}
            className="h-10"
          >
            Update Quota
          </Button>
        </div>
        {!isAuthority && (
          <p className="text-xs text-red-400 mt-2">
            Only the token authority can update minter quotas
          </p>
        )}
      </Card>
    </div>
  );
}
