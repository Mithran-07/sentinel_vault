"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  Lock,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Share2,
  Fingerprint,
  Building,
  Terminal,
  Activity,
  Database,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Search,
  Plus,
  Clock,
  Sparkles,
  ChevronRight,
  KeyRound,
  FileText,
  CreditCard,
  User,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default function LandingPage() {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [mockRevealed, setMockRevealed] = useState<boolean>(false);
  const [mockCopied, setMockCopied] = useState<boolean>(false);

  const architectureSteps = [
    {
      step: "01",
      title: "Client-Side Derivation (Argon2id)",
      tag: "Endpoint RAM",
      desc: "Your master password is never transmitted. The client executes Argon2id locally to derive a 256-bit Master Encryption Key (MEK) and an authentication hash.",
      spec: "Argon2id KDF • 64MB RAM • 3 iterations • CSPRNG salt",
    },
    {
      step: "02",
      title: "AES-256-GCM Envelope Encryption",
      tag: "Payload Hardening",
      desc: "Every credential item is encrypted with a distinct random 96-bit IV and 128-bit authentication tag before leaving memory. The server receives only opaque blobs.",
      spec: "WebCrypto API • 256-bit AES-GCM • Unique IV per item",
    },
    {
      step: "03",
      title: "Zero-Knowledge Blind Relay",
      tag: "Zero Server Decryption",
      desc: "Sentinel Vault servers verify the authentication hash and store encrypted blobs. The backend holds zero private keys and is mathematically incapable of decrypting data.",
      spec: "Blind index storage • PostgreSQL • Zero MEK retention",
    },
    {
      step: "04",
      title: "Tamper-Evident SHA-256 Audit Chain",
      tag: "Mathematical Proof",
      desc: "Every vault action computes H_n = SHA256(H_{n-1} || event). Any alteration or truncation of historical records causes immediate, verifiable chain failure.",
      spec: "Chained event hashes • Monotonic sequence • Client verifiable",
    },
  ];

  const handleMockCopy = () => {
    setMockCopied(true);
    setTimeout(() => setMockCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-canvas text-fg selection:bg-accent/20 selection:text-accent flex flex-col relative overflow-x-hidden">
      {/* Background Subtle Atmosphere */}
      <div className="absolute inset-0 subtle-grid opacity-60 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-accent/5 rounded-full blur-[140px] pointer-events-none" />

      {/* ── TOP NAVIGATION ──────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-canvas/80 backdrop-blur-xl border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-accent group-hover:border-accent/40 transition-colors shadow-xs">
              <Shield size={18} className="fill-accent/20" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm tracking-tight text-fg">Sentinel Vault</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-line text-fg-subtle">
                Zero-Knowledge
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-xs font-medium text-fg-muted">
            <a href="#product" className="hover:text-fg transition-colors">
              Product Workspace
            </a>
            <a href="#architecture" className="hover:text-fg transition-colors">
              Cryptography
            </a>
            <a href="#capabilities" className="hover:text-fg transition-colors">
              Capabilities
            </a>
            <a href="#trust" className="hover:text-fg transition-colors">
              Threat Model
            </a>
            <Link href="/enterprise" className="hover:text-fg transition-colors">
              Enterprise
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="text-xs font-medium text-fg-muted hover:text-fg px-2.5 py-1.5 transition-colors">
              Sign In
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm" className="gap-1.5">
                <span>Open Your Vault</span>
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <header className="pt-32 pb-16 md:pt-40 md:pb-24 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border border-line text-2xs font-mono text-fg-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>ZERO-KNOWLEDGE CREDENTIAL PLATFORM</span>
            <span className="text-line">•</span>
            <span className="text-fg-subtle">AES-256-GCM / Argon2id</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-fg leading-[1.1]">
            Your secrets. Your control. <br />
            <span className="text-fg-muted font-normal">Zero compromise.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-fg-muted max-w-2xl mx-auto leading-relaxed">
            The zero-knowledge credential vault built for engineering teams and security-first organizations.
            All encryption executes in your browser memory. Plaintext keys and secrets never reach our servers.
          </p>

          {/* Action Row */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full sm:w-auto gap-2">
                <span>Open Your Vault</span>
                <ArrowRight size={15} />
              </Button>
            </Link>
            <a href="#product" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto gap-2">
                <span>Explore the Interface</span>
              </Button>
            </a>
          </div>

          {/* Cryptographic Assurance Ticker */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-2xs font-mono text-fg-subtle border-t border-line/60 max-w-2xl mx-auto">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-lime" />
              <span>Client-Side AES-256-GCM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-lime" />
              <span>Argon2id KDF Derivation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-lime" />
              <span>SHA-256 Chained Audit Trail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-lime" />
              <span>FIDO2 Passkey Support</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── PRODUCT SHOWCASE MOCKUP ─────────────────────────────────────── */}
      <section id="product" className="py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-6 space-y-1.5">
          <div className="text-2xs font-mono text-accent uppercase tracking-wider">Product-Led Workspace</div>
          <h2 className="font-display text-2xl font-bold text-fg tracking-tight">The Sentinel Vault Workspace</h2>
          <p className="text-xs text-fg-muted max-w-md mx-auto">
            A fast, quiet, high-density interface. Zero unnecessary cards, zero visual noise.
          </p>
        </div>

        {/* Realistic Interactive Interface Mockup */}
        <div className="panel border border-line-strong shadow-popover overflow-hidden bg-surface">
          {/* Mock Window Top Bar */}
          <div className="h-9 px-4 bg-surface-2/80 border-b border-line flex items-center justify-between text-2xs text-fg-subtle select-none">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
              </div>
              <span className="font-mono ml-2 text-fg-subtle">app.sentinelvault.internal / vault</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
              <span className="text-lime">WebCrypto Isolated RAM Active</span>
            </div>
          </div>

          {/* Mock Body: Workspace Layout */}
          <div className="flex flex-col md:flex-row min-h-[460px]">
            {/* Mock Sidebar */}
            <div className="w-full md:w-56 p-4 border-r border-line bg-surface-2/30 flex flex-col justify-between shrink-0">
              <div className="space-y-4">
                {/* Wallet Selector */}
                <div className="px-2.5 py-2 rounded-lg bg-surface border border-line flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded bg-surface-2 text-accent flex items-center justify-center">
                      <Lock size={11} />
                    </div>
                    <span className="text-xs font-semibold text-fg truncate">Production Org</span>
                  </div>
                  <span className="text-[9px] font-mono text-fg-subtle">SSO</span>
                </div>

                {/* Sidebar Navigation */}
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-fg-subtle">Workspace</div>
                  <div className="px-2.5 py-1.5 rounded-md bg-surface-3 text-fg text-xs font-medium flex items-center justify-between border border-line">
                    <span className="flex items-center gap-2"><Lock size={13} className="text-accent" /> Credentials</span>
                    <span className="text-[10px] font-mono text-accent">3</span>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-md text-fg-muted hover:text-fg text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2"><ShieldCheck size={13} /> Security Health</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-surface-2 text-lime">Active</span>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-md text-fg-muted hover:text-fg text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2"><FileText size={13} /> Audit Ledger</span>
                    <span className="text-[9px] font-mono text-fg-subtle">Chained</span>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-md text-fg-muted hover:text-fg text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2"><Building size={13} /> Enterprise SSO</span>
                    <span className="text-[9px] font-mono text-fg-subtle">OIDC</span>
                  </div>
                </div>
              </div>

              {/* Memory status box */}
              <div className="p-2.5 rounded-lg bg-surface border border-line text-[10px] font-mono text-fg-subtle space-y-1">
                <div className="text-fg font-semibold flex items-center gap-1.5">
                  <KeyRound size={12} className="text-accent" />
                  <span>Memory Isolated</span>
                </div>
                <p className="text-[9px] leading-tight text-fg-muted">MEK derived locally. Never sent to server.</p>
              </div>
            </div>

            {/* Mock Main Table & Split Inspector */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Credentials List */}
              <div className="flex-1 p-5 space-y-4">
                {/* Search & Action Bar */}
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                    <input
                      readOnly
                      value=""
                      placeholder="Search credentials (⌘K)..."
                      className="field h-8 pl-8 text-xs bg-surface-2/60 pointer-events-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="primary" size="sm" className="h-8 text-xs gap-1">
                      <Plus size={13} /> New Credential
                    </Button>
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1 text-2xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-surface-3 text-fg border border-line font-medium">All (3)</span>
                  <span className="px-2 py-0.5 rounded text-fg-muted hover:text-fg">Logins (2)</span>
                  <span className="px-2 py-0.5 rounded text-fg-muted hover:text-fg">API Keys (1)</span>
                  <span className="px-2 py-0.5 rounded text-fg-muted hover:text-fg">Notes (0)</span>
                </div>

                {/* Table */}
                <div className="border border-line rounded-lg overflow-hidden bg-surface">
                  <div className="grid grid-cols-12 px-3 py-2 bg-surface-2/60 border-b border-line text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
                    <div className="col-span-5">Credential</div>
                    <div className="col-span-4">Account / Identifier</div>
                    <div className="col-span-3 text-right">Security</div>
                  </div>

                  <div className="divide-y divide-line text-xs font-mono">
                    {/* Row 1 - Active / Selected */}
                    <div className="grid grid-cols-12 px-3 py-2.5 items-center bg-surface-3 border-l-2 border-accent cursor-pointer">
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-surface border border-line flex items-center justify-center text-accent">
                          <Lock size={12} />
                        </div>
                        <div className="truncate">
                          <div className="font-sans font-semibold text-fg text-xs truncate">GitHub Enterprise</div>
                          <div className="text-[10px] text-fg-subtle truncate">github.com</div>
                        </div>
                      </div>
                      <div className="col-span-4 text-fg-muted truncate text-[11px]">sec-ops@company.com</div>
                      <div className="col-span-3 text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime/10 text-lime border border-lime/30">
                          22 chars
                        </span>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-12 px-3 py-2.5 items-center hover:bg-surface-2/40 cursor-pointer">
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-surface border border-line flex items-center justify-center text-uv">
                          <Terminal size={12} />
                        </div>
                        <div className="truncate">
                          <div className="font-sans font-semibold text-fg text-xs truncate">AWS Production IAM</div>
                          <div className="text-[10px] text-fg-subtle truncate">aws.amazon.com</div>
                        </div>
                      </div>
                      <div className="col-span-4 text-fg-muted truncate text-[11px]">infra-prod-admin</div>
                      <div className="col-span-3 text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-subtle border border-line">
                          API Key
                        </span>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-12 px-3 py-2.5 items-center hover:bg-surface-2/40 cursor-pointer">
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-surface border border-line flex items-center justify-center text-accent">
                          <Lock size={12} />
                        </div>
                        <div className="truncate">
                          <div className="font-sans font-semibold text-fg text-xs truncate">PostgreSQL Cluster</div>
                          <div className="text-[10px] text-fg-subtle truncate">db.internal:5432</div>
                        </div>
                      </div>
                      <div className="col-span-4 text-fg-muted truncate text-[11px]">pg_master_vault</div>
                      <div className="col-span-3 text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-subtle border border-line">
                          Database
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side Inspector Pane */}
              <div className="w-full md:w-72 p-4 border-t md:border-t-0 md:border-l border-line bg-surface-2/20 flex flex-col justify-between shrink-0 space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <div>
                      <h4 className="font-sans font-bold text-xs text-fg">GitHub Enterprise</h4>
                      <span className="text-[10px] font-mono text-accent">Decrypted locally in RAM</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-fg-subtle border border-line">
                      LOGIN
                    </span>
                  </div>

                  {/* Inspector Fields */}
                  <div className="mt-3 space-y-3 font-mono text-2xs">
                    <div>
                      <div className="text-fg-subtle uppercase text-[9px] mb-1">Username / Account</div>
                      <div className="p-2 rounded bg-surface border border-line text-fg select-all">
                        sec-ops@company.com
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-fg-subtle uppercase text-[9px] mb-1">
                        <span>Password</span>
                        <div className="flex items-center gap-2 font-mono">
                          <button
                            onClick={() => setMockRevealed(!mockRevealed)}
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            {mockRevealed ? <EyeOff size={10} /> : <Eye size={10} />}
                            {mockRevealed ? "Hide" : "Reveal"}
                          </button>
                          <button
                            onClick={handleMockCopy}
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            {mockCopied ? <Check size={10} className="text-lime" /> : <Copy size={10} />}
                            {mockCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-surface border border-line text-fg select-all break-all">
                        {mockRevealed ? "v7#Qp!9kL$xT2@8mN*4wZ" : "••••••••••••••••••••"}
                      </div>
                    </div>

                    <div>
                      <div className="text-fg-subtle uppercase text-[9px] mb-1">Website URL</div>
                      <div className="p-2 rounded bg-surface border border-line text-accent flex items-center justify-between truncate">
                        <span className="truncate">https://github.com</span>
                        <ExternalLink size={10} className="shrink-0 ml-1" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions Footer */}
                <div className="pt-3 border-t border-line flex items-center gap-2">
                  <Button variant="secondary" size="xs" className="flex-1 text-[11px]">
                    Share Ephemeral Link
                  </Button>
                  <Button variant="ghost" size="xs" className="text-[11px]">
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CRYPTOGRAPHIC PIPELINE (ARCHITECTURE) ───────────────────────── */}
      <section id="architecture" className="py-20 bg-surface-2/30 border-y border-line relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
            <div className="text-2xs font-mono text-accent uppercase tracking-wider">Zero-Knowledge Architecture</div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg">
              The Cryptographic Flow
            </h2>
            <p className="text-xs sm:text-sm text-fg-muted">
              Envelope encryption designed so that no server operator, compromise, or network adversary can read your credentials.
            </p>
          </div>

          {/* Interactive Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {architectureSteps.map((s, idx) => (
              <div
                key={s.step}
                onClick={() => setActiveStep(idx)}
                className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  activeStep === idx
                    ? "bg-surface border-accent shadow-xs scale-[1.01]"
                    : "bg-surface/50 border-line hover:border-line-strong hover:bg-surface"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xl font-bold text-accent">{s.step}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-2 text-fg-subtle border border-line">
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-sm text-fg mb-1.5">{s.title}</h3>
                  <p className="text-2xs text-fg-muted leading-relaxed mb-4">{s.desc}</p>
                </div>
                <div className="pt-3 border-t border-line font-mono text-[10px] text-fg-subtle truncate">
                  {s.spec}
                </div>
              </div>
            ))}
          </div>

          {/* Flow Diagram */}
          <div className="mt-10 p-6 rounded-xl border border-line bg-surface">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
              <div className="p-3.5 rounded-lg bg-surface-2/60 border border-line space-y-1">
                <div className="w-8 h-8 rounded bg-surface border border-line text-accent flex items-center justify-center mx-auto mb-2">
                  <Terminal size={15} />
                </div>
                <div className="text-xs font-semibold text-fg">1. Client Device</div>
                <div className="text-[11px] text-fg-subtle">Plaintext exists solely in browser RAM.</div>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-2/60 border border-line space-y-1">
                <div className="w-8 h-8 rounded bg-surface border border-line text-cyan flex items-center justify-center mx-auto mb-2">
                  <Lock size={15} />
                </div>
                <div className="text-xs font-semibold text-fg">2. TLS 1.3 Wire</div>
                <div className="text-[11px] text-fg-subtle">Only opaque ciphertext blobs & auth hash.</div>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-2/60 border border-line space-y-1">
                <div className="w-8 h-8 rounded bg-surface border border-line text-uv flex items-center justify-center mx-auto mb-2">
                  <Database size={15} />
                </div>
                <div className="text-xs font-semibold text-fg">3. Blind Relay</div>
                <div className="text-[11px] text-fg-subtle">Server verifies hash. Zero key knowledge.</div>
              </div>

              <div className="p-3.5 rounded-lg bg-surface-2/60 border border-line space-y-1">
                <div className="w-8 h-8 rounded bg-surface border border-line text-lime flex items-center justify-center mx-auto mb-2">
                  <ShieldCheck size={15} />
                </div>
                <div className="text-xs font-semibold text-fg">4. Chained Ledger</div>
                <div className="text-[11px] text-fg-subtle">Immutable SHA-256 integrity log.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CORE CAPABILITIES ───────────────────────────────────────────── */}
      <section id="capabilities" className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
          <div className="text-2xs font-mono text-accent uppercase tracking-wider">Features & Tooling</div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg">
            Built for High-Trust Security
          </h2>
          <p className="text-xs sm:text-sm text-fg-muted">
            The essential tools modern organizations need to manage access without sacrificing privacy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Feature 1 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-accent flex items-center justify-center">
              <Key size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">All Credential Types</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Logins, API Keys, Payment Cards, Identities, Secure Notes, and SSH keypairs with tailored field masks and entropy scoring.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-cyan flex items-center justify-center">
              <Share2 size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">Ephemeral Hash Sharing</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Share single credentials via time-boxed links. The decryption secret lives strictly in the URL hash (#) and is never sent to any server.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-lime flex items-center justify-center">
              <Activity size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">In-Memory Password Health</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Identify weak, reused, or stale credentials entirely inside your browser. No password hashes are ever sent to external APIs.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-accent flex items-center justify-center">
              <Fingerprint size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">Hardware Passkeys & FIDO2</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Phishing-resistant biometrics via WebAuthn. Unlock with TouchID, FaceID, or hardware security keys (YubiKey).
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-uv flex items-center justify-center">
              <Building size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">Enterprise SSO & Teams</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Multi-tenant organizations, invitations, and Single Sign-On via SAML 2.0 and OIDC (Okta, Google Workspace, Azure AD).
            </p>
          </div>

          {/* Feature 6 */}
          <div className="p-5 rounded-xl border border-line bg-surface space-y-3">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-lime flex items-center justify-center">
              <ShieldCheck size={17} />
            </div>
            <h3 className="font-display font-semibold text-sm text-fg">Chained Audit Verification</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Audit logs are sequentially linked with cryptographic SHA-256 hashes. Verify chain integrity on demand with one click.
            </p>
          </div>
        </div>
      </section>

      {/* ── THREAT MODEL & HONEST GUARANTEES ────────────────────────────── */}
      <section id="trust" className="py-16 bg-surface-2/20 border-t border-line">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 rounded-xl border border-line bg-surface space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line text-lime flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-fg">Our Threat Model & Realistic Guarantees</h3>
                <p className="text-2xs text-fg-subtle">Honest cryptographic commitments backed by open code</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-fg-muted leading-relaxed">
              <div className="space-y-2.5">
                <div className="font-mono font-semibold text-fg flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                  <CheckCircle2 size={13} className="text-lime" />
                  What We Guarantee
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-2xs text-fg-muted">
                  <li>Master passwords and MEK never touch our servers.</li>
                  <li>AES-256-GCM encryption executed locally in browser RAM.</li>
                  <li>Tamper-evident audit logs with monotonic hash chaining.</li>
                  <li>Zero analytics, ad trackers, or third-party telemetry scripts.</li>
                </ul>
              </div>

              <div className="space-y-2.5">
                <div className="font-mono font-semibold text-fg flex items-center gap-1.5 text-2xs uppercase tracking-wider text-warning">
                  <AlertCircle size={13} className="text-warning" />
                  User Stewardship
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-2xs text-fg-muted">
                  <li>Lost master passwords cannot be recovered by server administrators.</li>
                  <li>Client devices must be kept free of keyloggers and malware.</li>
                  <li>Generate and securely store emergency offline recovery codes.</li>
                  <li>Verify legitimate domain origins when using shared links.</li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs font-mono text-fg-subtle">
              <span>Architecture spec: docs/phase-0/02-cryptographic-architecture.md</span>
              <Link href="/register">
                <Button variant="primary" size="sm" className="gap-1.5">
                  <span>Create Free Vault</span>
                  <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="w-full bg-surface border-t border-line py-10 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-2xs text-fg-subtle font-mono">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-surface-2 border border-line flex items-center justify-center text-accent">
              <Shield size={13} />
            </div>
            <span>Sentinel Vault &copy; {new Date().getFullYear()} &bull; Zero-Knowledge Credential Security</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#architecture" className="hover:text-fg transition-colors">
              Cryptography
            </a>
            <a href="#capabilities" className="hover:text-fg transition-colors">
              Capabilities
            </a>
            <Link href="/enterprise" className="hover:text-fg transition-colors">
              Enterprise
            </Link>
            <Link href="/login" className="hover:text-fg transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
