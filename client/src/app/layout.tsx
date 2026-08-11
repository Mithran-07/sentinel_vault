import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { VaultProvider } from "@/context/VaultContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Vault — Zero-Knowledge Password Manager",
  description: "Enterprise-grade password vault demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <VaultProvider>{children}</VaultProvider>
      </body>
    </html>
  );
}
