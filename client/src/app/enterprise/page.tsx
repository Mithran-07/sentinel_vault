"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Shield, Users, Network, Lock, FileJson } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";

const FEATURES = [
  { icon: Shield, title: "SSO (SAML / OIDC)", detail: "Configure enterprise SSO for your organization." },
  { icon: Users, title: "SCIM provisioning", detail: "Auto-create/deprovision accounts from the HR system.", planned: true },
  { icon: Lock, title: "RBAC / ABAC", detail: "Roles, groups, and attribute-based policies.", planned: true },
  { icon: Network, title: "Collections", detail: "Share credential groups without exposing passwords.", planned: true },
  { icon: FileJson, title: "SIEM export", detail: "Stream audit events to external logging tools.", planned: true },
];

export default function EnterprisePage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"overview" | "sso">("overview");

  useEffect(() => {
    async function loadOrgs() {
      try {
        const res = await api.get("/orgs");
        if (res.ok) {
          const { data } = await res.json();
          setOrgs(data || []);
        }
      } catch (err) {
        setError("Failed to load organizations");
      } finally {
        setLoading(false);
      }
    }
    loadOrgs();
  }, []);

  const currentOrg = orgs[0]; // For demo, just pick the first org

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12 animate-in fade-in duration-500">
      <div className="mb-8">
        <Link href="/vault">
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to vault
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Enterprise</h1>
            <p className="text-muted-foreground">Manage organization settings and security policies.</p>
          </div>
          {currentOrg && (
            <div className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-accent" />
              {currentOrg.name}
              <Badge variant="outline" className="ml-2 bg-accent/10 text-accent border-accent/20">
                {currentOrg.myRole}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="flex border-b border-border/50 mb-8">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === "overview" ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Capabilities Overview
        </button>
        <button
          onClick={() => setActiveTab("sso")}
          className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === "sso" ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Single Sign-On (SSO)
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((f, i) => (
            <div 
              key={f.title} 
              className="group rounded-2xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-all hover:border-accent/30 flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center shadow-sm group-hover:bg-accent/5 group-hover:border-accent/20 group-hover:text-accent transition-colors">
                  <f.icon className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
                {f.planned && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">Planned</Badge>
                )}
                {!f.planned && (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Available</Badge>
                )}
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "sso" && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          {loading ? (
            <p className="text-muted-foreground">Loading organization context...</p>
          ) : !currentOrg ? (
            <div className="p-8 border border-border bg-surface rounded-2xl text-center">
              <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Organization Found</h3>
              <p className="text-sm text-muted-foreground mt-2">You must belong to an organization to configure SSO.</p>
            </div>
          ) : (
            <SsoConfigurationPanel orgId={currentOrg.id} myRole={currentOrg.myRole} />
          )}
        </div>
      )}
    </main>
  );
}

function SsoConfigurationPanel({ orgId, myRole }: { orgId: string; myRole: string }) {
  const [providerType, setProviderType] = useState<"OIDC" | "SAML">("OIDC");
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: "error"|"success", text: string} | null>(null);

  // Form states
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [issuer, setIssuer] = useState("");

  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [x509Certificate, setX509Certificate] = useState("");

  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  useEffect(() => {
    async function fetchSso() {
      try {
        const res = await api.get(`/orgs/${orgId}/sso`);
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setProviderType(data.type || "OIDC");
          if (data.type === "OIDC") {
            setClientId(data.clientId || "");
            setIssuer(data.issuer || "");
            setClientSecret(""); // Intentionally empty, write-only
          } else if (data.type === "SAML") {
            setEntityId(data.entityId || "");
            setSsoUrl(data.ssoUrl || "");
            setX509Certificate(data.x509Certificate || "");
          }
        }
      } catch (err) {
        // Normal if not configured
      } finally {
        setLoading(false);
      }
    }
    fetchSso();
  }, [orgId]);

  async function handleSaveOidc(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put(`/orgs/${orgId}/sso/oidc`, {
        clientId,
        clientSecret,
        issuer,
        isActive: true,
      });
      if (res.ok) {
        setMessage({ type: "success", text: "OIDC configured successfully" });
        const data = await api.get(`/orgs/${orgId}/sso`).then(r => r.json());
        setConfig(data);
        setClientSecret("");
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: body.error || "Failed to save OIDC" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save OIDC" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSaml(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put(`/orgs/${orgId}/sso/saml`, {
        entityId,
        ssoUrl,
        x509Certificate,
        isActive: true,
      });
      if (res.ok) {
        setMessage({ type: "success", text: "SAML configured successfully" });
        const data = await api.get(`/orgs/${orgId}/sso`).then(r => r.json());
        setConfig(data);
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: body.error || "Failed to save SAML" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save SAML" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading configuration...</div>;
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className={`p-4 rounded-lg border text-sm font-medium flex items-center ${
          message.type === "success" 
            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
            : "bg-destructive/10 text-destructive border-destructive/20"
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">Identity Provider</h2>
            <p className="text-sm text-muted-foreground mt-1">Configure your corporate identity provider (IdP).</p>
          </div>
          {config?.isActive && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
          )}
        </div>

        <div className="flex gap-4 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="idp" checked={providerType === "OIDC"} onChange={() => setProviderType("OIDC")} className="text-accent focus:ring-accent" disabled={!canManage} />
            <span className="text-sm font-medium">OpenID Connect (OIDC)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="idp" checked={providerType === "SAML"} onChange={() => setProviderType("SAML")} className="text-accent focus:ring-accent" disabled={!canManage} />
            <span className="text-sm font-medium">SAML 2.0</span>
          </label>
        </div>

        {providerType === "OIDC" && (
          <form onSubmit={handleSaveOidc} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Issuer URL</label>
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} required type="url" placeholder="https://idp.example.com" disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Client ID</label>
              <Input value={clientId} onChange={(e) => setClientId(e.target.value)} required placeholder="App Client ID" disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                Client Secret <span className="text-xs text-muted-foreground font-normal">(Stored encrypted via AWS KMS)</span>
              </label>
              <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required={!config || config.type !== "OIDC"} type="password" placeholder={config?.type === "OIDC" ? "•••••••• (Leave blank to keep existing)" : "Client Secret"} disabled={!canManage} />
            </div>
            {canManage && (
              <Button type="submit" isLoading={saving} className="mt-2 bg-accent hover:bg-accent-hover text-white">Save OIDC Configuration</Button>
            )}
          </form>
        )}

        {providerType === "SAML" && (
          <form onSubmit={handleSaveSaml} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Entity ID (Issuer)</label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} required placeholder="https://idp.example.com/saml2" disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">SSO URL (Login endpoint)</label>
              <Input value={ssoUrl} onChange={(e) => setSsoUrl(e.target.value)} required type="url" placeholder="https://idp.example.com/sso" disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">X.509 Certificate</label>
              <textarea 
                value={x509Certificate} 
                onChange={(e) => setX509Certificate(e.target.value)} 
                required 
                rows={5}
                className="w-full rounded-lg border border-border bg-background px-4 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="-----BEGIN CERTIFICATE-----..."
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <Button type="submit" isLoading={saving} className="mt-2 bg-accent hover:bg-accent-hover text-white">Save SAML Configuration</Button>
            )}
          </form>
        )}
      </div>
      
      {/* Attribute Mapping Section */}
      {config && (
        <SsoAttributeMapping orgId={orgId} canManage={canManage} />
      )}
    </div>
  );
}

function SsoAttributeMapping({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [idpAttr, setIdpAttr] = useState("");
  const [appAttr, setAppAttr] = useState("");

  useEffect(() => {
    async function loadMappings() {
      try {
        const res = await api.get(`/orgs/${orgId}/sso/attributes`);
        if (res.ok) {
          const data = await res.json();
          setMappings(data.mappings || []);
        }
      } catch (err) {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    loadMappings();
  }, [orgId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    try {
      const res = await api.post(`/orgs/${orgId}/sso/attributes`, { idpAttribute: idpAttr, appAttribute: appAttr });
      if (res.ok) {
        const { mapping } = await res.json();
        setMappings([...mappings, mapping]);
        setIdpAttr("");
        setAppAttr("");
      }
    } catch (err) {
      alert("Failed to add mapping");
    }
  }

  async function handleDelete(id: string) {
    if (!canManage) return;
    try {
      const res = await api.del(`/orgs/${orgId}/sso/attributes/${id}`);
      if (res.ok) {
        setMappings(mappings.filter(m => m.id !== id));
      }
    } catch (err) {
      alert("Failed to delete mapping");
    }
  }

  if (loading) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-1">Attribute Mapping</h2>
      <p className="text-sm text-muted-foreground mb-6">Map Identity Provider claims to application attributes for JIT provisioning and SCIM.</p>
      
      <div className="overflow-hidden border border-border rounded-lg mb-6">
        <table className="w-full text-left text-sm">
          <thead className="bg-surfaceHover">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground border-b border-border">IdP Attribute / Claim</th>
              <th className="px-4 py-3 font-medium text-muted-foreground border-b border-border">App Attribute</th>
              {canManage && <th className="px-4 py-3 font-medium text-muted-foreground border-b border-border w-24">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No attribute mappings configured. Default email claims will be used.</td>
              </tr>
            ) : (
              mappings.map(m => (
                <tr key={m.id} className="hover:bg-surfaceHover/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{m.idpAttribute}</td>
                  <td className="px-4 py-3 font-medium">{m.appAttribute}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(m.id)} className="text-destructive hover:text-red-400 font-medium">Remove</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">IdP Attribute</label>
            <Input value={idpAttr} onChange={(e) => setIdpAttr(e.target.value)} required placeholder="e.g. user.principalName" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">App Attribute</label>
            <Input value={appAttr} onChange={(e) => setAppAttr(e.target.value)} required placeholder="e.g. email" />
          </div>
          <Button type="submit" variant="outline" className="shrink-0 h-10">Add Mapping</Button>
        </form>
      )}
    </div>
  );
}

