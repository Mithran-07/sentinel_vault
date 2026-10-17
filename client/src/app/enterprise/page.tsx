"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { 
  Building2, 
  LogIn, 
  Users, 
  ShieldCheck, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  UserCheck, 
  UserX, 
  Mail, 
  Key,
  Shield,
  ExternalLink,
  ChevronRight,
  Info,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface OrgRecord {
  id: string;
  name: string;
  myRole?: string;
  role?: string;
  createdAt: string;
}

interface MemberRecord {
  id: string;
  userId: string;
  role: string;
  status: string;
  user?: { email: string };
  email?: string;
}

interface InvitationRecord {
  id: string;
  email: string;
  expiresAt: string;
}

export default function EnterprisePage() {
  const { toast } = { toast: useToast() };
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Active org details
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // SSO tab state
  const [activeTab, setActiveTab] = useState<"members" | "sso">("members");

  useEffect(() => {
    void loadOrgs();
  }, []);

  async function loadOrgs() {
    setLoading(true);
    try {
      const res = await api.get("/orgs");
      if (res.ok) {
        const json = await res.json();
        const list = json.data || json || [];
        setOrgs(list);
        if (list.length > 0 && !selectedOrgId) {
          setSelectedOrgId(list[0].id);
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOrgId) {
      void loadOrgMembers(selectedOrgId);
    } else {
      setMembers([]);
      setInvitations([]);
    }
  }, [selectedOrgId]);

  async function loadOrgMembers(orgId: string) {
    setLoadingMembers(true);
    try {
      const res = await api.get(`/orgs/${orgId}/members`);
      if (res.ok) {
        const json = await res.json();
        setMembers(json.data?.members || json.members || []);
        setInvitations(json.data?.invitations || json.invitations || []);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await api.post("/orgs", { name: newOrgName });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create organization");
      }
      toast.success(`Organization "${newOrgName}" created`);
      setCreateModalOpen(false);
      setNewOrgName("");
      await loadOrgs();
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrgId || !inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const res = await api.post(`/orgs/${selectedOrgId}/invitations`, { email: inviteEmail });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send invitation");
      }
      const data = await res.json();
      setGeneratedToken(data.token || data.data?.token || "INVITE-CREATED");
      toast.success("Invitation generated");
      await loadOrgMembers(selectedOrgId);
    } catch (err: any) {
      toast.error(err.message || "Failed to invite member");
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleUpdateMemberStatus(memberId: string, status: "ACTIVE" | "SUSPENDED") {
    if (!selectedOrgId) return;
    try {
      const res = await api.patch(`/orgs/${selectedOrgId}/members/${memberId}`, { status });
      if (!res.ok) throw new Error("Status update failed");
      toast.success(`Member set to ${status}`);
      await loadOrgMembers(selectedOrgId);
    } catch (err: any) {
      toast.error(err.message || "Failed to update member status");
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedOrgId) return;
    if (!window.confirm("Remove this member from the organization?")) return;
    try {
      const res = await api.del(`/orgs/${selectedOrgId}/members/${memberId}`);
      if (!res.ok) throw new Error("Removal failed");
      toast.success("Member removed");
      await loadOrgMembers(selectedOrgId);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  }

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const myRole = selectedOrg?.myRole || selectedOrg?.role || "MEMBER";
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  const headerActions = (
    <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
      <Plus size={16} className="mr-1.5" />
      <span>New Organization</span>
    </Button>
  );

  return (
    <AppShell pageTitle="Enterprise & Organizations" headerActions={headerActions}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Banner */}
        <div className="panel p-6 bg-gradient-to-r from-surface-2/60 via-surface to-surface-2/40 border-line flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="eyebrow flex items-center gap-1.5 mb-1.5">
              <Building2 size={14} className="text-accent" />
              <span>Enterprise Identity & Access</span>
            </div>
            <h2 className="font-display text-xl font-bold text-fg">
              Multi-Tenant Organization Management
            </h2>
            <p className="text-xs text-fg-muted mt-1 max-w-xl leading-relaxed">
              Provision teams, configure enterprise SAML 2.0 / OIDC Identity Providers, and administer access policies without compromising zero-knowledge boundaries.
            </p>
          </div>

          {orgs.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-fg-subtle font-mono">Organization:</label>
              <select
                value={selectedOrgId || ""}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="field h-9 text-xs w-auto bg-surface-2 cursor-pointer"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="panel p-8 space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div className="panel p-12 text-center max-w-md mx-auto flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3 text-fg-subtle">
              <Building2 size={26} />
            </div>
            <h3 className="font-display text-base font-bold text-fg mb-1">
              No Organization Active
            </h3>
            <p className="text-xs text-fg-muted mb-5 leading-relaxed">
              Create an organization to invite teammates, share encrypted collections, and connect enterprise Single Sign-On (SSO).
            </p>
            <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} className="mr-1.5" />
              Create Organization
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Navigation Tabs (Members / SSO) */}
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <button
                onClick={() => setActiveTab("members")}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === "members"
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                <Users size={15} />
                <span>Members & Directory ({members.length})</span>
              </button>
              <button
                onClick={() => setActiveTab("sso")}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === "sso"
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                <LogIn size={15} />
                <span>Single Sign-On (SSO)</span>
              </button>
            </div>

            {/* TAB: MEMBERS */}
            {activeTab === "members" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-display text-sm font-bold text-fg">
                      Active Organization Members
                    </h3>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      Verified team members with scoped role permissions.
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInviteEmail("");
                        setGeneratedToken(null);
                        setInviteModalOpen(true);
                      }}
                    >
                      <Plus size={14} className="mr-1.5" />
                      Invite Member
                    </Button>
                  )}
                </div>

                {loadingMembers ? (
                  <div className="panel p-6 space-y-3">
                    {[1, 2].map((n) => (
                      <Skeleton key={n} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <div className="panel p-8 text-center text-xs text-fg-subtle">
                    No members found in this organization.
                  </div>
                ) : (
                  <div className="panel overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-line bg-surface-2/40 text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
                          <th className="py-3 px-6">Member</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {members.map((m) => {
                          const displayEmail = m.user?.email || m.email || "Member";
                          const isSuspended = m.status === "SUSPENDED";

                          return (
                            <tr key={m.id} className="hover:bg-surface-2/30 transition-colors">
                              <td className="py-3 px-6 font-medium text-fg flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-surface-2 border border-line flex items-center justify-center font-mono text-[11px] text-accent">
                                  {displayEmail.substring(0, 2).toUpperCase()}
                                </div>
                                <span>{displayEmail}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 text-fg border border-line">
                                  {m.role}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                                    isSuspended
                                      ? "bg-warning/15 text-warning border-warning/30"
                                      : "bg-lime/15 text-lime border-lime/30"
                                  }`}
                                >
                                  {m.status}
                                </span>
                              </td>
                              <td className="py-3 px-6 text-right">
                                {canManage && m.role !== "OWNER" && (
                                  <div className="flex justify-end gap-1.5">
                                    {isSuspended ? (
                                      <button
                                        onClick={() => handleUpdateMemberStatus(m.id, "ACTIVE")}
                                        className="p-1 text-lime hover:bg-lime/10 rounded transition-colors"
                                        title="Reactivate Member"
                                      >
                                        <UserCheck size={14} />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleUpdateMemberStatus(m.id, "SUSPENDED")}
                                        className="p-1 text-warning hover:bg-warning/10 rounded transition-colors"
                                        title="Suspend Member"
                                      >
                                        <UserX size={14} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleRemoveMember(m.id)}
                                      className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                                      title="Remove Member"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pending Invitations list */}
                {invitations.length > 0 && (
                  <div className="space-y-3 pt-4">
                    <h4 className="font-display text-xs font-bold text-fg-subtle uppercase tracking-wider">
                      Pending Invitations ({invitations.length})
                    </h4>
                    <div className="panel divide-y divide-line text-xs">
                      {invitations.map((inv) => (
                        <div key={inv.id} className="p-3.5 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-fg-subtle" />
                            <span className="font-medium text-fg">{inv.email}</span>
                          </div>
                          <span className="text-[11px] font-mono text-fg-subtle">
                            Expires {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: SSO CONFIGURATION */}
            {activeTab === "sso" && selectedOrgId && (
              <SsoConfigurationPanel orgId={selectedOrgId} canManage={canManage} />
            )}
          </div>
        )}
      </div>

      {/* ── CREATE ORG MODAL ──────────────────────────────────────────────── */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-sm p-6 animate-pop-in">
            <h3 className="font-display text-base font-bold text-fg mb-1">
              Create Organization
            </h3>
            <p className="text-xs text-fg-muted mb-4">
              Create an isolated enterprise organization for your company or team.
            </p>
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="label">Organization Name *</label>
                <input
                  required
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Cyber Defense"
                  className="field"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creatingOrg}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={creatingOrg}>
                  Create Organization
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── INVITE MEMBER MODAL ───────────────────────────────────────────── */}
      {inviteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative bg-surface border border-line rounded-2xl shadow-pop w-full max-w-md p-6 animate-pop-in">
            <h3 className="font-display text-base font-bold text-fg mb-1">
              Invite Team Member
            </h3>
            <p className="text-xs text-fg-muted mb-4 leading-relaxed">
              Generate an onboarding invitation. The recipient will authenticate and accept via zero-knowledge key delivery.
            </p>

            {!generatedToken ? (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="label">Member Email *</label>
                  <input
                    required
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="field"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setInviteModalOpen(false)}
                    disabled={sendingInvite}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" isLoading={sendingInvite}>
                    Generate Invitation
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-lime/10 border border-lime/30 rounded-xl text-xs text-lime">
                  Invitation created successfully for <strong>{inviteEmail}</strong>.
                </div>
                <div>
                  <label className="label">Invitation Token</label>
                  <div className="flex items-center gap-2 p-2 bg-surface-2 rounded-xl border border-line">
                    <code className="font-mono text-xs text-accent truncate flex-1">
                      {generatedToken}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedToken);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                    >
                      {copiedToken ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
                      <span>{copiedToken ? "Copied" : "Copy"}</span>
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="primary" size="sm" onClick={() => setInviteModalOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── SSO Configuration Sub-Component ─────────────────────────────────────────
function SsoConfigurationPanel({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const { toast } = { toast: useToast() };
  const [providerType, setProviderType] = useState<"OIDC" | "SAML">("OIDC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // OIDC Fields
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [issuer, setIssuer] = useState("");

  // SAML Fields
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [x509Certificate, setX509Certificate] = useState("");

  useEffect(() => {
    async function fetchSso() {
      setLoading(true);
      try {
        const res = await api.get(`/orgs/${orgId}/sso`);
        if (res.ok) {
          const data = await res.json();
          if (data.type) setProviderType(data.type);
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
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchSso();
  }, [orgId]);

  async function handleSaveSso(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    try {
      const payload =
        providerType === "OIDC"
          ? { type: "OIDC", clientId, clientSecret, issuer }
          : { type: "SAML", entityId, ssoUrl, x509Certificate };

      const res = await api.post(`/orgs/${orgId}/sso`, payload);
      if (!res.ok) throw new Error("Failed to save SSO configuration");
      toast.success(`${providerType} SSO configuration saved`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save SSO configuration");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="panel p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="panel p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-line gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-fg">
            Single Sign-On (SSO) Provider
          </h3>
          <p className="text-xs text-fg-muted mt-0.5">
            Allow members to log into this organization via corporate identity providers (Okta, Entra ID, Google).
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setProviderType("OIDC")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              providerType === "OIDC"
                ? "bg-surface text-accent border border-accent/35 shadow-sm"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            OIDC / OAuth 2.0
          </button>
          <button
            type="button"
            onClick={() => setProviderType("SAML")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              providerType === "SAML"
                ? "bg-surface text-accent border border-accent/35 shadow-sm"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            SAML 2.0
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveSso} className="space-y-4">
        {providerType === "OIDC" && (
          <>
            <div>
              <label className="label">Discovery / Issuer URL *</label>
              <input
                required
                type="url"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                disabled={!canManage}
                placeholder="https://identity.company.com/oauth2/default"
                className="field"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Client ID *</label>
                <input
                  required
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={!canManage}
                  placeholder="0oa...xyz"
                  className="field font-mono text-xs"
                />
              </div>
              <div>
                <label className="label">Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  disabled={!canManage}
                  placeholder="••••••••••••••••"
                  className="field font-mono text-xs"
                />
              </div>
            </div>
          </>
        )}

        {providerType === "SAML" && (
          <>
            <div>
              <label className="label">Identity Provider Entity ID *</label>
              <input
                required
                type="text"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                disabled={!canManage}
                placeholder="https://idp.company.com/entityid"
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">Single Sign-On (SSO) URL *</label>
              <input
                required
                type="url"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
                disabled={!canManage}
                placeholder="https://idp.company.com/sso/saml"
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="label">Public X.509 Certificate *</label>
              <textarea
                required
                rows={4}
                value={x509Certificate}
                onChange={(e) => setX509Certificate(e.target.value)}
                disabled={!canManage}
                placeholder="-----BEGIN CERTIFICATE-----&#10;MIID...&#10;-----END CERTIFICATE-----"
                className="field h-auto py-2 font-mono text-xs leading-relaxed"
              />
            </div>
          </>
        )}

        {canManage && (
          <div className="pt-3 border-t border-line flex justify-end">
            <Button type="submit" variant="primary" isLoading={saving}>
              Save SSO Configuration
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
