"use client";

import Link from "next/link";


export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-accent flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Vault</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
            Log in
          </Link>
          <Link href="/register" className="text-sm font-medium bg-foreground text-background px-4 py-2 rounded-md hover:bg-foreground/90 transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight">
          Uncompromising security for your <span className="text-accent">digital life.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-foreground/70 max-w-2xl">
          An enterprise-grade, zero-knowledge password manager. Your data is encrypted locally before it ever leaves your device. Only you hold the keys.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href="/register" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-medium text-lg transition-colors flex items-center justify-center gap-2">
            Create your vault
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-surface border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight">How Zero-Knowledge Works</h2>
            <p className="mt-4 text-foreground/70">Three steps to absolute privacy. The server never sees your master password.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="p-6 rounded-2xl bg-background border border-border/50 hover:border-accent/50 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-surfaceHover flex items-center justify-center mb-6 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">1. Derive Key Locally</h3>
              <p className="text-foreground/70 leading-relaxed">
                Your master password is run through Argon2id right in your browser, generating a strong encryption key that never leaves your device.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl bg-background border border-border/50 hover:border-accent/50 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-surfaceHover flex items-center justify-center mb-6 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">2. Encrypt Everything</h3>
              <p className="text-foreground/70 leading-relaxed">
                Vault items are encrypted using AES-256-GCM. What looks like sensitive data to you becomes incomprehensible ciphertext.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-2xl bg-background border border-border/50 hover:border-accent/50 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-surfaceHover flex items-center justify-center mb-6 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">3. Sync Ciphertext</h3>
              <p className="text-foreground/70 leading-relaxed">
                Only the encrypted blobs are sent to our servers. Even if our database is compromised, your passwords remain mathematically secure.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
