"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const StablecoinDashboard = dynamic(
  () =>
    import("@/components/StablecoinDashboard").then(
      (mod) => mod.StablecoinDashboard
    ),
  { ssr: false }
);

export default function Home() {
  const { connected, publicKey } = useWallet();

  return (
    <main style={{ minHeight: "100vh", padding: 20 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
          maxWidth: 800,
          margin: "0 auto 32px",
        }}
      >
        <h1 style={{ fontFamily: "monospace", fontSize: 20 }}>SSS Dashboard</h1>
        <WalletMultiButtonDynamic />
      </header>

      {connected && publicKey ? (
        <StablecoinDashboard />
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            fontFamily: "monospace",
          }}
        >
          <h2>Connect your wallet to get started</h2>
          <p style={{ color: "#888", marginTop: 8 }}>
            Use the button above to connect a Solana wallet
          </p>
        </div>
      )}
    </main>
  );
}
