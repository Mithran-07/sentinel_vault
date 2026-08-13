"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useVault } from '@/context/VaultContext';
import { 
  Building2, Users, UserPlus, Shield, Settings, 
  ArrowLeft, Search, Plus, Mail, CheckCircle2, 
  XCircle, Copy, Check, Clock, ShieldAlert,
  AlertCircle, ChevronRight, Briefcase, Key, Lock, Share2
} from 'lucide-react';

// Types
type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';
type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

interface Organization {
  id: string;
  name: string;
  createdAt: string;
  role: OrgRole;
  status: MemberStatus;
  memberCount?: number;
}

interface Member {
  id: string;
  userId: string;
  email: string;
  role: OrgRole;
  status: MemberStatus;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  token?: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

export default function EnterpriseDashboard() {
  const router = useRouter();
  const { vaultKey } = useVault();
  
  // App State
  const [activeView, setActiveView] = useState<'list' | 'detail'>('list');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  
  // Data State
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  
  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showAcceptInvite, setShowAcceptInvite] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  
  // Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedInviteToken, setGeneratedInviteToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);

  // Initialization
  useEffect(() => {
    if (!vaultKey) {
      router.replace('/login');
      return;
    }
    fetchOrgs();
  }, [vaultKey, router]);

  const fetchOrgs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get('/orgs');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const json = await res.json();
      setOrgs(json.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrgDetails = async (orgId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [orgRes, membersRes] = await Promise.all([
        api.get(`/orgs/${orgId}`),
        api.get(`/orgs/${orgId}/members`)
      ]);
      if (!orgRes.ok || !membersRes.ok) throw new Error('Failed to load org details');
      
      const orgData = await orgRes.json();
      const membersData = await membersRes.json();
      
      setSelectedOrg(orgData.data);
      setMembers(membersData.data.members || []);
      setInvitations(membersData.data.invitations || []);
      setActiveView('detail');
    } catch (err: any) {
      setError(err.message || 'Failed to load organization details');
      setActiveView('list');
    } finally {
      setIsLoading(false);
    }
  };

  // Actions
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    
    try {
      setIsActionLoading(true);
      const res = await api.post('/orgs', { name: newOrgName });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const json = await res.json();
      await fetchOrgs();
      setShowCreateOrg(false);
      setNewOrgName('');
      // Optionally navigate to new org
      if (json.data?.id) {
        fetchOrgDetails(json.data.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    
    try {
      setIsActionLoading(true);
      const res = await api.post('/orgs/invitations/accept', { token: inviteToken });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await fetchOrgs();
      setShowAcceptInvite(false);
      setInviteToken('');
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !inviteEmail.trim()) return;
    
    try {
      setIsActionLoading(true);
      const res = await api.post(`/orgs/${selectedOrg.id}/invitations`, { email: inviteEmail });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const json = await res.json();
      setGeneratedInviteToken(json.data.token);
      // Refresh details to show pending invite
      const membersRes = await api.get(`/orgs/${selectedOrg.id}/members`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.data.members || []);
        setInvitations(membersData.data.invitations || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to invite member');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateMemberStatus = async (memberId: string, status: MemberStatus) => {
    if (!selectedOrg) return;
    try {
      const res = await api.patch(`/orgs/${selectedOrg.id}/members/${memberId}`, { status });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      // Refresh members
      setMembers(members.map(m => m.id === memberId ? { ...m, status } : m));
    } catch (err: any) {
      setError(err.message || 'Failed to update member status');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedOrg || !window.confirm('Are you sure you want to remove this member?')) return;
    try {
      const res = await api.del(`/orgs/${selectedOrg.id}/members/${memberId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setMembers(members.filter(m => m.id !== memberId));
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Helper Components
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-1 text-xs font-medium bg-green-500/10 text-green-400 rounded-full border border-green-500/20">Active</span>;
      case 'SUSPENDED':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-500/10 text-yellow-400 rounded-full border border-yellow-500/20">Suspended</span>;
      case 'REMOVED':
        return <span className="px-2 py-1 text-xs font-medium bg-red-500/10 text-red-400 rounded-full border border-red-500/20">Removed</span>;
      case 'PENDING':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">Pending</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-slate-500/10 text-slate-400 rounded-full border border-slate-500/20">{status}</span>;
    }
  };

  const RoleBadge = ({ role }: { role: string }) => {
    switch (role) {
      case 'OWNER':
        return <span className="flex items-center gap-1 text-xs font-medium text-purple-400"><Shield className="w-3 h-3" /> Owner</span>;
      case 'ADMIN':
        return <span className="flex items-center gap-1 text-xs font-medium text-blue-400"><Settings className="w-3 h-3" /> Admin</span>;
      default:
        return <span className="flex items-center gap-1 text-xs font-medium text-slate-400"><Users className="w-3 h-3" /> Member</span>;
    }
  };

  if (isLoading && !orgs.length) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/vault')}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Vault
            </button>
            <div className="h-6 w-px bg-slate-800" />
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Building2 className="w-5 h-5 text-blue-400" />
              Enterprise
            </div>
          </div>
          
          {activeView === 'list' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAcceptInvite(true)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Accept Invite
              </button>
              <button
                onClick={() => setShowCreateOrg(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Organization
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">{error}</div>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {activeView === 'list' ? (
          // --- LIST VIEW ---
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Your Organizations</h1>
              <p className="text-slate-400 text-sm">Manage your enterprise workspaces and access shared resources.</p>
            </div>

            {orgs.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-2xl border border-slate-800 border-dashed bg-slate-900/20">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">No organizations yet</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
                  Create an organization to share secure notes with your team, or accept an invitation to join one.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowCreateOrg(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Organization
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orgs.map((org) => (
                  <div 
                    key={org.id}
                    onClick={() => fetchOrgDetails(org.id)}
                    className="group relative p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 hover:border-slate-700 transition-all cursor-pointer overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 rounded-xl bg-slate-800 text-blue-400 group-hover:scale-110 transition-transform">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <StatusBadge status={org.status} />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-1 group-hover:text-white transition-colors">{org.name}</h3>
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800/50">
                      <RoleBadge role={org.role} />
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {org.memberCount || 1} members
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Planned Features Section */}
            <div className="mt-16 pt-8 border-t border-slate-800">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Coming Soon in Phase 4</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Briefcase, title: 'RBAC', desc: 'Granular permissions' },
                  { icon: Users, title: 'Groups', desc: 'Team management' },
                  { icon: Share2, title: 'Collections', desc: 'Shared secure folders' },
                  { icon: Key, title: 'SSO & SCIM', desc: 'Enterprise identity' }
                ].map((feat, i) => (
                  <div key={i} className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/30 flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                      <feat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-300">{feat.title}</div>
                      <div className="text-xs text-slate-500">{feat.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // --- DETAIL VIEW ---
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : selectedOrg ? (
              <>
                {/* Org Header */}
                <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setActiveView('list')}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-white">{selectedOrg.name}</h1>
                        <RoleBadge role={selectedOrg.role} />
                      </div>
                      <div className="text-sm text-slate-400 flex items-center gap-2">
                        <span>ID: <code className="px-1 py-0.5 bg-slate-900 rounded text-xs">{selectedOrg.id}</code></span>
                        <span>•</span>
                        <span>Created {new Date(selectedOrg.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  {selectedOrg.role === 'OWNER' && (
                    <button
                      onClick={() => {
                        setInviteEmail('');
                        setGeneratedInviteToken('');
                        setShowInviteMember(true);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite Member
                    </button>
                  )}
                </div>

                {/* Members Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-slate-200">Members</h3>
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="px-6 py-4 font-medium">User</th>
                          <th className="px-6 py-4 font-medium">Role</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                          <th className="px-6 py-4 font-medium">Joined</th>
                          {selectedOrg.role === 'OWNER' && <th className="px-6 py-4 font-medium text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {members.map(member => (
                          <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-200">{member.email}</div>
                              <div className="text-xs text-slate-500 font-mono mt-0.5">{member.userId}</div>
                            </td>
                            <td className="px-6 py-4"><RoleBadge role={member.role} /></td>
                            <td className="px-6 py-4"><StatusBadge status={member.status} /></td>
                            <td className="px-6 py-4 text-slate-400">{new Date(member.joinedAt).toLocaleDateString()}</td>
                            {selectedOrg.role === 'OWNER' && (
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-2">
                                  {member.role !== 'OWNER' && (
                                    <>
                                      {member.status === 'ACTIVE' ? (
                                        <button 
                                          onClick={() => handleUpdateMemberStatus(member.id, 'SUSPENDED')}
                                          className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                                        >
                                          Suspend
                                        </button>
                                      ) : (
                                        <button 
                                          onClick={() => handleUpdateMemberStatus(member.id, 'ACTIVE')}
                                          className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-500 hover:bg-green-500/20"
                                        >
                                          Activate
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => handleRemoveMember(member.id)}
                                        className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                      >
                                        Remove
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                        {members.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No members found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pending Invitations Section */}
                {invitations.length > 0 && (
                  <div className="space-y-4 pt-8">
                    <h3 className="text-lg font-medium text-slate-200">Pending Invitations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {invitations.map(invite => (
                        <div key={invite.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 mt-1">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-sm text-slate-200">{invite.email}</div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Expires {new Date(invite.expiresAt).toLocaleDateString()}
                            </div>
                            <div className="mt-2">
                              <StatusBadge status={invite.status} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </main>

      {/* --- MODALS --- */}
      
      {/* Create Org Modal */}
      {showCreateOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Create Organization</h3>
                <button onClick={() => setShowCreateOrg(false)} className="text-slate-400 hover:text-white">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateOrg}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Organization Name</label>
                    <input
                      type="text"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="mt-8 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateOrg(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isActionLoading || !newOrgName.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isActionLoading && <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Accept Invite Modal */}
      {showAcceptInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Accept Invitation</h3>
                <button onClick={() => setShowAcceptInvite(false)} className="text-slate-400 hover:text-white">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAcceptInvite}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Invitation Token</label>
                    <input
                      type="text"
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      placeholder="Paste your token here..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="mt-8 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAcceptInvite(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isActionLoading || !inviteToken.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isActionLoading && <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
                    Join Organization
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteMember && selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-white">Invite to {selectedOrg.name}</h3>
                <button onClick={() => setShowInviteMember(false)} className="text-slate-400 hover:text-white">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              {!generatedInviteToken ? (
                <form onSubmit={handleInviteMember}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1.5">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-8 flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowInviteMember(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isActionLoading || !inviteEmail.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isActionLoading && <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
                      Generate Invite
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-green-300">
                      Invitation generated successfully! Share this token securely with {inviteEmail}. It will expire in 7 days.
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Invitation Token</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block p-3 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 break-all font-mono">
                        {generatedInviteToken}
                      </code>
                      <button
                        onClick={() => copyToClipboard(generatedInviteToken)}
                        className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors shrink-0"
                        title="Copy to clipboard"
                      >
                        {copiedToken ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => setShowInviteMember(false)}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
