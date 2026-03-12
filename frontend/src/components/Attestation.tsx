"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { useToast } from "./Toast";
import { useTransactionHistory } from "./TransactionHistory";
import { formatNumber } from "@/lib/constants";

interface AttestationData {
  reserveAmount: BN;
  tokenSupply: BN;
  attestor: PublicKey;
  expiry: BN;
  uri: string;
  timestamp: BN;
}

interface AttestationProps {
  connected: boolean;
  totalSupply: bigint | null;
  decimals: number;
  attestReserves?: (reserveAmount: BN, expiry: BN, uri: string) => Promise<string>;
  getAttestation?: () => Promise<AttestationData | null>;
}

function formatBN(val: BN, decimals: number): string {
  const str = val.toString();
  if (str === "0") return "0";
  if (str.length <= decimals) {
    const padded = str.padStart(decimals, "0");
    const frac = padded.replace(/0+$/, "");
    return frac ? `0.${frac}` : "0";
  }
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals).replace(/0+$/, "");
  const formattedWhole = Number(whole).toLocaleString();
  return frac ? `${formattedWhole}.${frac}` : formattedWhole;
}

export function Attestation({
  connected,
  totalSupply,
  decimals,
  attestReserves,
  getAttestation,
}: AttestationProps) {
  const toast = useToast();
  const { addTransaction } = useTransactionHistory();
  const [attestation, setAttestation] = useState<AttestationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Form state
  const [reserveAmount, setReserveAmount] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [uri, setUri] = useState("");
  const [submitConfirm, setSubmitConfirm] = useState(false);

  const hasHooks = !!attestReserves && !!getAttestation;

  const fetchAttestation = useCallback(async () => {
    if (!getAttestation) return;
    setFetchLoading(true);
    try {
      const data = await getAttestation();
      setAttestation(data);
    } catch {
      // Attestation not found is normal
    } finally {
      setFetchLoading(false);
    }
  }, [getAttestation]);

  useEffect(() => {
    if (hasHooks && connected) {
      fetchAttestation();
    }
  }, [hasHooks, connected, fetchAttestation]);

  const handleSubmit = async () => {
    if (!attestReserves) return;
    if (!submitConfirm) {
      setSubmitConfirm(true);
      return;
    }
    setLoading(true);
    try {
      const rawAmount = new BN(parseFloat(reserveAmount) * Math.pow(10, decimals));
      const expiryTs = new BN(Math.floor(Date.now() / 1000) + parseInt(expiryHours) * 3600);
      const sig = await attestReserves(rawAmount, expiryTs, uri);
      toast.success("Reserve attestation submitted", sig);
      addTransaction({ type: "attestation", description: "Reserve attestation submitted", signature: sig });
      setReserveAmount("");
      setUri("");
      setSubmitConfirm(false);
      await fetchAttestation();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setSubmitConfirm(false);
    }
  };

  // Calculate collateralization ratio
  const supplyBN = totalSupply !== null ? new BN(totalSupply.toString()) : null;
  let collateralRatio: number | null = null;
  let isCollateralized = true;

  if (attestation && supplyBN && !supplyBN.isZero()) {
    const ratio = attestation.reserveAmount.muln(10000).div(supplyBN);
    collateralRatio = ratio.toNumber() / 100;
    isCollateralized = collateralRatio >= 100;
  }

  const isExpired = attestation
    ? attestation.expiry.toNumber() * 1000 < Date.now()
    : false;

  if (!connected) {
    return (
      <Card title="Reserve Attestation" subtitle="Connect wallet to view attestation data">
        <div className="text-center py-8 text-text-muted">
          Connect your wallet to view attestation data
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Attestation Status */}
      <Card title="Reserve Attestation" subtitle="Proof-of-reserves for backing verification">
        {!hasHooks ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="text-text-secondary text-sm font-medium mb-1">
              Reserve Attestation
            </p>
            <p className="text-text-muted text-xs max-w-sm mx-auto">
              Connect your wallet and load a stablecoin mint to enable reserve attestation.
              This feature enables proof-of-reserves verification for stablecoin backing.
            </p>
            <Badge variant="info" className="mt-4">Requires Connection</Badge>
          </div>
        ) : fetchLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="spinner w-6 h-6" />
          </div>
        ) : attestation ? (
          <div className="space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Reserve Amount"
                value={`$${formatBN(attestation.reserveAmount, decimals)}`}
                variant="default"
              />
              <MetricCard
                label="Token Supply"
                value={supplyBN ? formatBN(supplyBN, decimals) : "--"}
                variant="default"
              />
              <MetricCard
                label="Collateral Ratio"
                value={collateralRatio !== null ? `${collateralRatio.toFixed(2)}%` : "--"}
                variant={isCollateralized ? "success" : "danger"}
              />
              <MetricCard
                label="Expiry"
                value={new Date(attestation.expiry.toNumber() * 1000).toLocaleDateString()}
                variant={isExpired ? "danger" : "default"}
              />
            </div>

            {/* Status Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isCollateralized ? "success" : "danger"} dot>
                {isCollateralized ? "Fully Collateralized" : "Undercollateralized"}
              </Badge>
              {isExpired && (
                <Badge variant="danger" dot>Attestation Expired</Badge>
              )}
              {!isCollateralized && (
                <Badge variant="warning" dot>Auto-Pause Triggered</Badge>
              )}
            </div>

            {/* Attestation Details */}
            {attestation.uri && (
              <div className="p-3 rounded-lg bg-navy-900 border border-border">
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
                  Attestation URI
                </p>
                <a
                  href={attestation.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors break-all"
                >
                  {attestation.uri}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-text-muted text-sm">No attestation data found</p>
            <p className="text-text-muted text-xs mt-1">
              Submit a reserve attestation below
            </p>
          </div>
        )}
      </Card>

      {/* Submit Attestation Form */}
      {hasHooks && (
        <Card
          title="Submit Attestation"
          subtitle="Submit new reserve attestation (requires Attestor role)"
        >
          <div className="space-y-3">
            <Input
              label="Reserve Amount"
              placeholder="e.g., 1000000.00"
              type="number"
              step="any"
              value={reserveAmount}
              onChange={(e) => { setReserveAmount(e.target.value); setSubmitConfirm(false); }}
              hint={`Current total supply: ${totalSupply !== null ? formatNumber(totalSupply, decimals) : "--"}`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Expiry (hours from now)"
                placeholder="24"
                type="number"
                value={expiryHours}
                onChange={(e) => { setExpiryHours(e.target.value); setSubmitConfirm(false); }}
              />
              <Input
                label="Attestation URI (optional)"
                placeholder="https://..."
                value={uri}
                onChange={(e) => { setUri(e.target.value); setSubmitConfirm(false); }}
              />
            </div>
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!reserveAmount}
              variant={submitConfirm ? "success" : "primary"}
              className="w-full"
            >
              {submitConfirm ? "Confirm Attestation" : "Submit Reserve Attestation"}
            </Button>
            {submitConfirm && (
              <p className="text-xs text-amber-400 text-center">
                Click again to confirm submitting attestation with reserve amount of {reserveAmount}
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "success" | "danger";
}) {
  const valueColor =
    variant === "success"
      ? "text-emerald-400"
      : variant === "danger"
        ? "text-red-400"
        : "text-text-primary";

  return (
    <div className="p-3 rounded-lg bg-navy-900 border border-border">
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-semibold ${valueColor} number-appear`}>{value}</p>
    </div>
  );
}
