"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";

export default function HealthRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/security");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-text-primary p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <p className="text-sm text-text-secondary font-mono">Redirecting to Security Health...</p>
      </div>
    </main>
  );
}
