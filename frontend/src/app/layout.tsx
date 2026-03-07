import type { Metadata } from "next";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "Solana Stablecoin Standard",
  description: "SSS Dashboard - Manage stablecoins on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0a0a", color: "#e0e0e0" }}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
