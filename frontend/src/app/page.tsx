"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const Dashboard = dynamic(
  () => import("@/components/Dashboard").then((mod) => mod.Dashboard),
  { ssr: false }
);

function getNetworkLabel(): string {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  if (rpc.includes("devnet")) return "Devnet";
  if (rpc.includes("mainnet")) return "Mainnet";
  if (rpc.includes("localhost") || rpc.includes("127.0.0.1")) return "Localnet";
  if (rpc) return "Custom";
  return "Devnet";
}

export default function Home() {
  const { connected } = useWallet();
  const networkLabel = getNetworkLabel();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-navy-950/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-text-primary leading-tight">
                SSS Dashboard
              </h1>
              <p className="text-[11px] text-text-muted leading-tight">
                Solana Stablecoin Standard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {connected && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {networkLabel}
              </span>
            )}
            <WalletMultiButtonDynamic />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-6">
        {connected ? (
          <ErrorBoundary>
            <Dashboard />
          </ErrorBoundary>
        ) : (
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center py-24">
              <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-cyan-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-text-primary mb-3">
                Connect Your Wallet
              </h2>
              <p className="text-text-muted max-w-lg mx-auto mb-8">
                Connect a Solana wallet to manage stablecoins built with the
                Solana Stablecoin Standard. Mint, burn, manage roles, compliance,
                and authority transfers.
              </p>
              <div className="flex justify-center">
                <WalletMultiButtonDynamic />
              </div>

              {/* Feature Cards */}
              <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
                {[
                  {
                    title: "Mint & Burn",
                    desc: "Create and destroy tokens with role-based access control",
                  },
                  {
                    title: "7 Role Types",
                    desc: "Minter, Burner, Pauser, Freezer, Blacklister, Seizer, Attestor",
                  },
                  {
                    title: "Compliance",
                    desc: "Blacklist, freeze, thaw, and seize with transfer hooks",
                  },
                  {
                    title: "2-Step Authority",
                    desc: "Secure authority transfers with initiate/accept flow",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="p-4 rounded-xl bg-surface border border-border text-left"
                  >
                    <h3 className="text-sm font-semibold text-text-primary mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-text-muted">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span>Solana Stablecoin Standard (SSS)</span>
          <a
            href="https://github.com/solanabr/solana-stablecoin-standard"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-secondary transition-colors"
          >
            Built on Solana
          </a>
        </div>
      </footer>
    </div>
  );
}
