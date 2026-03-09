"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TransactionHistoryProvider } from "@/components/TransactionHistory";

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

const FEATURES = [
  {
    title: "Role-Based Access",
    description: "7 granular role types control every stablecoin operation with configurable quotas",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2.228 2.228 0 013 16.9c0-2.86 2.17-5.192 4.903-5.349a5.002 5.002 0 019.194 0 5.382 5.382 0 012.403 2.519M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: "Compliance Suite",
    description: "Blacklisting, freeze/thaw, and asset seizure via Token-2022 transfer hooks",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Reserve Attestation",
    description: "On-chain proof-of-reserves with auto-pause when undercollateralized",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
  {
    title: "Transfer Hooks",
    description: "Custom transfer validation with blacklist enforcement on every token transfer",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.47 8.344a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
];

export default function Home() {
  const { connected } = useWallet();
  const networkLabel = getNetworkLabel();

  return (
    <div className="min-h-screen bg-animated-gradient">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-navy-950/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-600/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-text-muted bg-navy-800 px-2.5 py-1 rounded-full border border-border">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-pulse" />
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
            <TransactionHistoryProvider>
              <Dashboard />
            </TransactionHistoryProvider>
          </ErrorBoundary>
        ) : (
          /* Hero / Landing Section */
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="relative">
              {/* Grid pattern overlay */}
              <div className="absolute inset-0 hero-grid pointer-events-none" />

              <div className="relative text-center pt-16 pb-12 sm:pt-24 sm:pb-16">
                {/* SSS Logo */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-600/20">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
                  <span className="gradient-text">Solana Stablecoin</span>
                  <br />
                  <span className="text-text-primary">Standard</span>
                </h2>

                <p className="text-text-secondary text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
                  The institutional-grade framework for issuing and managing compliant stablecoins
                  on Solana. Built with Token-2022, transfer hooks, and role-based access control.
                </p>

                <div className="flex justify-center mb-16">
                  <WalletMultiButtonDynamic />
                </div>

                {/* Feature Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                  {FEATURES.map((feature) => (
                    <div
                      key={feature.title}
                      className="card-hover p-5 rounded-xl bg-surface/80 backdrop-blur-sm border border-border text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3 text-cyan-400 group-hover:bg-cyan-500/15 transition-colors">
                        {feature.icon}
                      </div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1.5">
                        {feature.title}
                      </h3>
                      <p className="text-xs text-text-muted leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Architecture Highlights */}
                <div className="mt-16 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-text-muted">
                  {[
                    "Token-2022",
                    "Transfer Hooks",
                    "Permanent Delegate",
                    "7 Role Types",
                    "2-Step Authority",
                    "Auto-Pause",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full border border-border bg-navy-900/50 backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
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
