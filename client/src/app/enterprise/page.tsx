"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Building2, LogIn, Webhook, Shield, EyeOff, Eye, BarChart, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function EnterprisePage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrgs() {
      try {
        const res = await api.get("/orgs");
        if (res.ok) {
          const { data } = await res.json();
          setOrgs(data || []);
        }
      } catch (err) {
      } finally {
        setLoading(false);
      }
    }
    loadOrgs();
  }, []);

  const currentOrg = orgs[0];

  return (
    <AppShell pageTitle="Enterprise Settings">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <p className="text-[14px] text-slate-500 max-w-2xl mt-2">Manage Single Sign-On, Directory Sync, and advanced organizational controls for your Sentinel Vault deployment.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: SSO Configuration */}
          <div className="xl:col-span-8 space-y-8">
            <div className="bg-surface rounded-xl border border-border-light p-[28px] shadow-sm">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-border-light">
                <div>
                  <h3 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2">
                    <LogIn className="text-slate-400" size={20} />
                    Single Sign-On (SSO)
                  </h3>
                  <p className="text-[14px] text-slate-500 mt-1">Configure identity provider integration.</p>
                </div>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[12px] font-semibold tracking-wider uppercase rounded-full flex items-center gap-1.5 border border-slate-200">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                  {currentOrg ? "Configurable" : "Not Configured"}
                </span>
              </div>

              {loading ? (
                <p className="text-slate-500">Loading organization context...</p>
              ) : !currentOrg ? (
                <div className="p-8 border border-border-light bg-slate-50 rounded-xl text-center">
                  <Building2 size={40} className="text-slate-300 mx-auto mb-4" />
                  <h3 className="text-[18px] font-semibold text-slate-900">No Organization Found</h3>
                  <p className="text-[14px] text-slate-500 mt-2">You must belong to an organization to configure SSO.</p>
                </div>
              ) : (
                <SsoConfigurationPanel orgId={currentOrg.id} myRole={currentOrg.myRole} />
              )}
            </div>
          </div>

          {/* Right Column: Stats & Roadmap */}
          <div className="xl:col-span-4 space-y-8">
            <div className="bg-surface rounded-xl border border-border-light p-[28px] shadow-sm">
              <h3 className="text-[18px] font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <BarChart className="text-primary" size={20} />
                Organization Status
              </h3>
              
              {currentOrg ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-border-light">
                    <span className="text-[14px] text-slate-600">Active Users</span>
                    <span className="text-[16px] font-semibold text-slate-900">1,248</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-border-light">
                    <span className="text-[14px] text-slate-600">Enterprise Seats</span>
                    <span className="text-[16px] font-semibold text-slate-900">2,000</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[14px] text-slate-600">Directory Sync</span>
                    <span className="bg-success-bg text-success-text text-[12px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full">Healthy</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No organization context</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SsoConfigurationPanel({ orgId, myRole }: { orgId: string; myRole: string }) {
  const [providerType, setProviderType] = useState<"OIDC" | "SAML">("OIDC");
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          } else if (data.type === "SAML") {
            setEntityId(data.entityId || "");
            setSsoUrl(data.ssoUrl || "");
            setX509Certificate(data.x509Certificate || "");
          }
        }
      } catch (err) {
      } finally {
        setLoading(false);
      }
    }
    fetchSso();
  }, [orgId]);

  if (loading) return <div className="text-slate-500">Loading configuration...</div>;

  return (
    <div>
      <div className="flex gap-4 mb-8 border-b border-border-light">
        <button 
          onClick={() => setProviderType("OIDC")}
          className={`px-4 py-2 text-[14px] font-semibold transition-colors ${providerType === "OIDC" ? "text-primary border-b-2 border-primary -mb-[1px]" : "text-slate-500 hover:text-slate-700"}`}
        >
          OIDC / OAuth 2.0
        </button>
        <button 
          onClick={() => setProviderType("SAML")}
          className={`px-4 py-2 text-[14px] font-semibold transition-colors ${providerType === "SAML" ? "text-primary border-b-2 border-primary -mb-[1px]" : "text-slate-500 hover:text-slate-700"}`}
        >
          SAML 2.0
        </button>
      </div>

      {providerType === "OIDC" && (
        <form className="space-y-6">
          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">Identity Provider Issuer URL</label>
            <input 
              value={issuer} 
              onChange={(e) => setIssuer(e.target.value)} 
              disabled={!canManage}
              type="url"
              className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70" 
            />
            <p className="text-[12px] text-slate-500 mt-1.5">The discovery URL for your OIDC provider.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">Client ID</label>
              <input 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
                disabled={!canManage}
                type="text"
                className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70" 
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">Client Secret</label>
              <input 
                value={clientSecret} 
                onChange={(e) => setClientSecret(e.target.value)} 
                disabled={!canManage}
                type="password"
                placeholder={config?.type === "OIDC" ? "••••••••" : ""}
                className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70" 
              />
            </div>
          </div>
          {canManage && (
            <div className="pt-6 border-t border-border-light flex justify-end gap-3">
              <Button type="button" variant="ghost" className="border-[1.5px] border-border-light">Cancel</Button>
              <Button type="submit" variant="primary" isLoading={saving}>Save Configuration</Button>
            </div>
          )}
        </form>
      )}

      {providerType === "SAML" && (
        <form className="space-y-6">
          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">IdP Entity ID</label>
            <input 
              value={entityId} 
              onChange={(e) => setEntityId(e.target.value)} 
              disabled={!canManage}
              type="text"
              className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70" 
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">Sign-in URL</label>
            <input 
              value={ssoUrl} 
              onChange={(e) => setSsoUrl(e.target.value)} 
              disabled={!canManage}
              type="url"
              className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70" 
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-slate-600 mb-2 uppercase">X.509 Certificate</label>
            <textarea 
              value={x509Certificate} 
              onChange={(e) => setX509Certificate(e.target.value)} 
              disabled={!canManage}
              rows={4}
              className="w-full px-4 py-2 bg-slate-50 border-[1.5px] border-border-light rounded-lg text-slate-700 font-body-md text-body-md focus:outline-none focus:border-primary disabled:opacity-70 font-mono text-sm" 
            />
          </div>
          {canManage && (
            <div className="pt-6 border-t border-border-light flex justify-end gap-3">
              <Button type="button" variant="ghost" className="border-[1.5px] border-border-light">Cancel</Button>
              <Button type="submit" variant="primary" isLoading={saving}>Save Configuration</Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
