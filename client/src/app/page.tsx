import Link from "next/link";
import { Shield, Key, Wallet, Users, KeyRound, Building, ScrollText, AlertTriangle, Database, Lock, Laptop, Trash2, Server, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col w-full h-full bg-slate-50 text-slate-900 font-sans antialiased overflow-y-auto overflow-x-hidden selection:bg-primary-light selection:text-primary-dark">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-border-light flat no-shadows">
        <div className="flex justify-between items-center px-4 md:px-[40px] py-4 max-w-[1400px] mx-auto">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-[24px] text-primary transition-transform hover:scale-95">
            <Shield size={28} className="fill-current text-primary" />
            Sentinel Vault
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="hidden md:inline-block px-4 py-2 text-[16px] font-semibold text-slate-600 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="px-5 py-2.5 bg-primary text-white text-[16px] font-semibold rounded-lg shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:bg-primary-dark transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Create Vault
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 md:pt-32">
        {/* Hero Section */}
        <section className="relative bg-slate-50 py-[96px] px-4 md:px-[40px] overflow-hidden" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-[36px] md:text-[48px] font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
              Credentials That Stay Yours. <br className="hidden md:block"/>
              <span className="text-primary">Always.</span>
            </h1>
            <p className="text-[18px] font-semibold text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              The enterprise-grade zero-knowledge vault for modern teams. Securely store, manage, and share sensitive data with cryptographic certainty.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <Link 
                href="/register" 
                className="w-full sm:w-auto px-8 py-3.5 bg-primary text-white text-[16px] font-semibold rounded-lg shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:bg-primary-dark transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Create Your Vault
                <ArrowRight size={20} />
              </Link>
              <button className="w-full sm:w-auto px-8 py-3.5 bg-white border-[1.5px] border-border-light text-slate-700 text-[16px] font-semibold rounded-lg hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                View Documentation
              </button>
            </div>
          </div>

          {/* Interface Mockup */}
          <div className="mt-20 max-w-5xl mx-auto relative z-10 px-4 md:px-0">
            <div className="bg-white/80 backdrop-blur-md border-[1.5px] border-border-light rounded-xl p-2 md:p-4 shadow-[0_20px_50px_rgba(79,70,229,0.1)]">
              {/* Fallback to a placeholder gradient if image is not accessible, using the same aspect ratio */}
              <div className="w-full rounded-lg border border-border-light shadow-sm aspect-[16/9] bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col overflow-hidden">
                {/* Minimal Header */}
                <div className="h-12 border-b border-border-light bg-white flex items-center px-4 gap-4">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-danger"></div>
                    <div className="w-3 h-3 rounded-full bg-warning"></div>
                    <div className="w-3 h-3 rounded-full bg-success"></div>
                  </div>
                  <div className="flex-1 max-w-md mx-auto h-6 bg-slate-100 rounded-md"></div>
                </div>
                {/* Body layout */}
                <div className="flex-1 flex">
                  {/* Sidebar */}
                  <div className="w-48 border-r border-border-light bg-slate-50 p-4 space-y-3">
                    <div className="h-8 bg-primary/20 rounded-md"></div>
                    <div className="h-8 bg-slate-200/50 rounded-md"></div>
                    <div className="h-8 bg-slate-200/50 rounded-md"></div>
                  </div>
                  {/* Content area */}
                  <div className="flex-1 bg-white p-6">
                    <div className="h-10 w-48 bg-slate-100 rounded-lg mb-6"></div>
                    <div className="space-y-3">
                      <div className="h-16 bg-slate-50 border border-slate-100 rounded-lg"></div>
                      <div className="h-16 bg-slate-50 border border-slate-100 rounded-lg"></div>
                      <div className="h-16 bg-slate-50 border border-slate-100 rounded-lg"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid Section */}
        <section className="py-[96px] px-4 md:px-[40px] bg-white">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-[32px] font-bold text-slate-900 mb-4 tracking-tight">Engineered for Absolute Security</h2>
              <p className="text-[16px] font-medium text-slate-600 max-w-2xl mx-auto">Every line of code is designed to ensure that only you hold the keys to your data. No exceptions, no backdoors.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <Key size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Zero-Knowledge Architecture</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Your master password never leaves your device. Data is encrypted and decrypted locally before reaching our servers.</p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <Wallet size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Multi-Wallet Support</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Seamlessly integrate and manage multiple decentralized identities and cryptographic wallets from a single interface.</p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <Shield size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Granular Access Control</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Implement strict role-based access policies. Share specific credentials with team members without exposing the raw data.</p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <ScrollText size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Immutable Audit Logs</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Track every access attempt, modification, and sharing event with cryptographic, tamper-evident logging.</p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <KeyRound size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Biometric Authentication</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Leverage modern device capabilities for secure, frictionless access using WebAuthn and hardware security modules.</p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[28px] hover:border-primary/50 transition-colors group">
                <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center mb-6 text-primary">
                  <Database size={24} className="fill-current" />
                </div>
                <h3 className="text-[18px] font-semibold text-slate-900 mb-3">Encrypted Sync</h3>
                <p className="text-[14px] text-slate-600 leading-relaxed">Your vault remains synchronized across all your trusted devices instantly, maintaining end-to-end encryption throughout transit.</p>
              </div>
            </div>
          </div>
        </section>

        {/* The Encryption Flow (Adapted from original page but restyled) */}
        <section id="security" className="py-[96px] px-4 md:px-[40px] bg-slate-50 border-y border-border-light">
          <div className="max-w-[1400px] mx-auto">
            <div className="bg-white border-[1.5px] border-border-light rounded-xl p-[40px] shadow-sm flex flex-col">
              <div className="text-center mb-10 space-y-2">
                <h3 className="text-[24px] font-bold text-slate-900 tracking-tight">The Encryption Flow</h3>
                <p className="text-[14px] text-slate-500">A visual representation of our Zero-Knowledge pipeline.</p>
              </div>
              
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 relative mb-12">
                {/* Device Box */}
                <div className="w-56 h-36 border-[1.5px] border-border-light rounded-xl bg-white flex flex-col items-center justify-center p-4 z-10 shadow-sm hover:border-primary/50 transition-colors">
                  <Laptop size={32} className="mb-3 text-slate-700" />
                  <div className="text-[16px] font-bold text-slate-900 mb-1">Your Device</div>
                  <div className="text-[12px] text-slate-500 text-center leading-tight">Master Password entered.<br/>Vault encrypted locally.</div>
                </div>
                
                {/* Arrow */}
                <div className="flex-1 flex flex-col items-center justify-center w-full min-w-[100px] max-w-[200px]">
                  <div className="text-[10px] font-mono text-slate-400 mb-2 tracking-widest uppercase whitespace-nowrap">Ciphertext Only (TLS 1.3)</div>
                  <div className="w-full border-t-[2px] border-dashed border-slate-300 relative flex items-center justify-end">
                    <div className="absolute -right-1 w-3 h-3 border-t-[2px] border-r-[2px] border-slate-300 rotate-45"></div>
                  </div>
                </div>
                
                {/* Server Box */}
                <div className="w-56 h-36 border-[1.5px] border-border-light rounded-xl bg-white flex flex-col items-center justify-center p-4 z-10 shadow-sm hover:border-primary/50 transition-colors">
                  <Server size={32} className="mb-3 text-slate-700" />
                  <div className="text-[16px] font-bold text-slate-900 mb-1">Sentinel Servers</div>
                  <div className="text-[12px] text-slate-500 text-center leading-tight">Blindly routes ciphertext.<br/>No keys stored.</div>
                </div>
                
                {/* Arrow 2 */}
                <div className="flex-1 flex flex-col items-center justify-center w-full min-w-[60px] max-w-[100px]">
                  <div className="w-full border-t-[2px] border-slate-300 relative flex items-center justify-end">
                    <div className="absolute -right-1 w-3 h-3 border-t-[2px] border-r-[2px] border-slate-300 rotate-45"></div>
                  </div>
                </div>
                
                {/* DB Box */}
                <div className="w-56 h-36 border-[1.5px] border-border-light rounded-xl bg-white flex flex-col items-center justify-center p-4 z-10 shadow-sm hover:border-primary/50 transition-colors">
                  <Database size={32} className="mb-3 text-slate-700" />
                  <div className="text-[16px] font-bold text-slate-900 mb-1">Storage</div>
                  <div className="text-[12px] text-slate-500 text-center leading-tight">Encrypted blobs rest<br/>securely in our database.</div>
                </div>
              </div>
              
              <div className="bg-danger-bg border-l-[4px] border-danger rounded-r-lg px-5 py-4 flex gap-4 items-start max-w-4xl mx-auto w-full">
                <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
                <div>
                  <div className="text-[14px] font-bold text-slate-900 mb-1">Important Disclaimer</div>
                  <div className="text-[14px] text-slate-700 leading-relaxed">Because the server never sees or stores your master password, we cannot recover it if lost. Your security relies on your stewardship of the master key.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full bg-slate-800 flex flex-col md:flex-row justify-between items-center px-4 md:px-[40px] py-[96px]">
        <div className="mb-8 md:mb-0 text-center md:text-left">
          <span className="text-white font-bold text-[24px] block mb-2 flex items-center justify-center md:justify-start gap-2">
            <Shield size={24} className="fill-current text-primary-light" />
            Sentinel Vault
          </span>
          <p className="text-slate-400 text-[14px]">© 2024 Sentinel Vault. All rights reserved.</p>
        </div>
        <nav className="flex flex-wrap justify-center gap-6">
          <a className="text-slate-400 hover:text-white transition-colors text-[14px]" href="#">Privacy Policy</a>
          <a className="text-slate-400 hover:text-white transition-colors text-[14px]" href="#">Terms of Service</a>
          <a className="text-slate-400 hover:text-white transition-colors text-[14px]" href="#">Enterprise</a>
          <a className="text-slate-400 hover:text-white transition-colors text-[14px]" href="#">Contact</a>
        </nav>
      </footer>
    </div>
  );
}
