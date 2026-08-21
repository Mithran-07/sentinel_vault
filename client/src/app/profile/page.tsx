"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens } from "@/lib/api";
import { useVault } from "@/context/VaultContext";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";
import { User, Lock, Shield, Key, Info, Smartphone, Monitor, X, LogOut, Wallet, FileLock2, Laptop, Verified } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { vaultKey, email, clearSession, wallets } = useVault();
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!vaultKey) {
      router.replace("/login");
    }
  }, [vaultKey, router]);

  if (!vaultKey) return null;

  function logout() {
    clearTokens();
    clearSession();
    router.push("/login");
  }

  return (
    <AppShell pageTitle="Profile Settings">
      <div className="max-w-[700px] mx-auto space-y-6 pb-8">
        {/* Page Header */}
        <div className="mb-8">
          <p className="text-[14px] text-slate-500 mt-2">Manage your identity and cryptographic keys.</p>
        </div>

        {/* Profile Identity Card */}
        <section className="bg-surface rounded-xl p-[28px] border border-border-light shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-light rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-[32px] font-bold relative shadow-md shrink-0 border-4 border-white">
            {email?.substring(0, 2).toUpperCase()}
          </div>
          
          <div className="flex-1 text-center md:text-left z-10">
            <h3 className="text-[24px] font-bold text-slate-900 truncate max-w-full">{email}</h3>
            <p className="text-[14px] text-slate-600 mb-4">Zero-Knowledge Encrypted</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-bg text-success-text text-[12px] font-semibold tracking-wider uppercase">
                <Verified size={16} />
                Identity Verified
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-light text-primary-dark text-[12px] font-semibold tracking-wider uppercase">
                <Key size={16} />
                Vault Active
              </span>
            </div>
          </div>
          
          <div className="md:self-center z-10">
            <Button variant="ghost" className="bg-surface border-[1.5px] border-border-light text-slate-700">
              Edit Profile
            </Button>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface rounded-xl p-6 border border-border-light shadow-sm flex flex-col items-center text-center hover:-translate-y-1 transition-transform duration-300">
            <div className="w-12 h-12 bg-primary-light text-primary rounded-full flex items-center justify-center mb-3">
              <Wallet size={24} />
            </div>
            <span className="text-[28px] font-bold text-slate-900 block">{wallets.length}</span>
            <span className="text-[12px] font-semibold tracking-wider text-slate-500 uppercase mt-1">Connected Wallets</span>
          </div>
          
          <div className="bg-surface rounded-xl p-6 border border-border-light shadow-sm flex flex-col items-center text-center hover:-translate-y-1 transition-transform duration-300">
            <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mb-3">
              <FileLock2 size={24} />
            </div>
            <span className="text-[28px] font-bold text-slate-900 block">--</span>
            <span className="text-[12px] font-semibold tracking-wider text-slate-500 uppercase mt-1">Saved Credentials</span>
          </div>
          
          <div className="bg-surface rounded-xl p-6 border border-border-light shadow-sm flex flex-col items-center text-center hover:-translate-y-1 transition-transform duration-300">
            <div className="w-12 h-12 bg-success-bg text-success rounded-full flex items-center justify-center mb-3">
              <Monitor size={24} />
            </div>
            <span className="text-[28px] font-bold text-slate-900 block">1</span>
            <span className="text-[12px] font-semibold tracking-wider text-slate-500 uppercase mt-1">Active Sessions</span>
          </div>
        </section>

        {/* Security Settings */}
        <section className="bg-surface rounded-xl border border-border-light shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border-light">
            <h3 className="text-[18px] font-semibold text-slate-900">Master Password</h3>
          </div>
          <div className="bg-primary-light/50 p-6 flex items-start gap-4 border-b border-primary-light">
            <Info size={24} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] text-slate-800 font-medium mb-1">Your Master Password is critical.</p>
              <p className="text-[14px] text-slate-600">
                Sentinel Vault does not store your Master Password. If you forget it, you will lose access to all encrypted data permanently. Changing your password will re-encrypt your vault.
              </p>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h4 className="text-[14px] font-medium text-slate-900">Change Master Password</h4>
                <p className="text-[14px] text-slate-500 mt-1">Last changed: Never</p>
              </div>
              <Button variant="ghost" className="border-[1.5px] border-border-light text-slate-700 bg-white hover:bg-slate-50">
                <Key size={18} className="mr-2" />
                Change Password
              </Button>
            </div>
          </div>
        </section>

        {/* Storage Quota */}
        <section className="bg-surface rounded-xl border border-border-light shadow-sm p-6">
          <h3 className="text-[18px] font-semibold text-slate-900 mb-4">Storage Quota</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-[12px] font-mono text-slate-500 font-semibold tracking-wider">
              <span>0.1 MB</span>
              <span>100 MB</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: "1%" }}></div>
            </div>
            <p className="text-[14px] text-slate-500">Enterprise Plan • Encrypted Blob Storage</p>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-surface rounded-xl border border-border-light shadow-sm p-6 mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-[18px] font-semibold text-danger">Danger Zone</h3>
              <p className="text-[14px] text-slate-500 mt-1">Sign out of this device and lock the local vault cache.</p>
            </div>
            <Button onClick={logout} variant="danger" className="shrink-0 w-full md:w-auto h-11 px-6 shadow-[0_4px_14px_0_rgba(244,63,94,0.39)] hover:shadow-[0_6px_20px_rgba(244,63,94,0.23)] border-0">
              <LogOut size={18} className="mr-2" />
              Sign Out Device
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
