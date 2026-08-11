"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface VaultContextValue {
  vaultKey: Uint8Array | null;
  email: string | null;
  setSession: (vaultKey: Uint8Array, email: string) => void;
  clearSession: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  return (
    <VaultContext.Provider
      value={{
        vaultKey,
        email,
        setSession: (key, em) => {
          setVaultKey(key);
          setEmail(em);
        },
        clearSession: () => {
          setVaultKey(null);
          setEmail(null);
        },
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
