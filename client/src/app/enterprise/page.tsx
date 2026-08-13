"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Shield, Users, Network, Lock, FileJson } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const FEATURES = [
  { icon: Shield, title: "SSO (SAML / OIDC)", detail: "Google Workspace, Entra ID, Okta login for org members." },
  { icon: Users, title: "SCIM provisioning", detail: "Auto-create/deprovision accounts from the HR system." },
  { icon: Lock, title: "RBAC / ABAC", detail: "Roles, groups, and attribute-based policies over collections." },
  { icon: Network, title: "Collections & sharing", detail: "Share credential groups (e.g. 'Production AWS') without exposing individual passwords." },
  { icon: FileJson, title: "SIEM export", detail: "Stream audit events to Splunk / Sentinel / Datadog via JSON/CEF/Syslog." },
  { icon: Building2, title: "Just-in-time access", detail: "Time-boxed credential checkout with manager approval." },
];

export default function EnterprisePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12 animate-in fade-in duration-500">
      <div className="mb-10">
        <Link href="/vault">
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to vault
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mb-3">Enterprise Capabilities</h1>
        <p className="text-muted-foreground max-w-2xl text-lg">
          Phase 4 features. These are not fully implemented in this demo, but represent the planned 
          surface area for enterprise-grade management.
        </p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {FEATURES.map((f, i) => (
          <div 
            key={f.title} 
            className="group rounded-2xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-all hover:border-accent/30 flex flex-col animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center shadow-sm group-hover:bg-accent/5 group-hover:border-accent/20 group-hover:text-accent transition-colors">
                <f.icon className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">Planned</Badge>
            </div>
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.detail}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

