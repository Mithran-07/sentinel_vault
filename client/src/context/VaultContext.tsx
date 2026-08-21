"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { walletApi, Wallet } from "../lib/api";

interface VaultContextValue {
  vaultKey: Uint8Array | null;
  email: string | null;
  wallets: Wallet[];
  activeWalletId: string | null;
  loadingWallets: boolean;
  walletError: string | null;
  setSession: (vaultKey: Uint8Array, email: string) => void;
  clearSession: () => void;
  loadWallets: () => Promise<void>;
  selectWallet: (id: string) => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const loadWallets = async () => {
    try {
      setLoadingWallets(true);
      setWalletError(null);
      const data = await walletApi.list();
      setWallets(data);
      if (data.length > 0) {
        // If we don't have an active wallet, or it's not in the list, pick default
        if (!activeWalletId || !data.find((w) => w.id === activeWalletId)) {
          const defaultWallet = data.find((w) => w.isDefault) || data[0];
          setActiveWalletId(defaultWallet.id);
        }
      } else {
        setActiveWalletId(null);
      }
    } catch (err: any) {
      setWalletError(err.message || "Failed to load wallets");
    } finally {
      setLoadingWallets(false);
    }
  };

  // Load wallets automatically when a session is established
  useEffect(() => {
    if (vaultKey) {
      loadWallets();
    } else {
      setWallets([]);
      setActiveWalletId(null);
    }
  }, [vaultKey]);

  return (
    <VaultContext.Provider
      value={{
        vaultKey,
        email,
        wallets,
        activeWalletId,
        loadingWallets,
        walletError,
        setSession: (key, em) => {
          setVaultKey(key);
          setEmail(em);
        },
        clearSession: () => {
          setVaultKey(null);
          setEmail(null);
          setWallets([]);
          setActiveWalletId(null);
        },
        loadWallets,
        selectWallet: (id: string) => setActiveWalletId(id),
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
