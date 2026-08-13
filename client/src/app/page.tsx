import Link from "next/link";
import { Shield, Lock, Key, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-accent/20">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 lg:px-10 py-5 bg-background/80 backdrop-blur-xl sticky top-0 z-50 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-soft">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">Vault</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link href="/register">
            <Button className="bg-foreground text-background hover:bg-foreground/90 shadow-soft">
              Get Started
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-32 lg:py-40 text-center overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px] -z-10" />
        
        <Badge variant="outline" className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          Enterprise Security, Zero Compromises
        </Badge>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
          Absolute privacy for your <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-400">digital assets.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          A zero-knowledge password manager built for teams. Your data is encrypted locally before it ever leaves your device. We couldn't read it even if we wanted to.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in zoom-in-95 duration-1000 delay-150">
          <Link href="/register">
            <Button size="lg" className="h-12 px-8 text-base shadow-soft group bg-accent hover:bg-accent-hover text-white border-0">
              Create your vault
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="h-12 px-8 text-base">
              Sign into existing
            </Button>
          </Link>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-32 bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">How Zero-Knowledge Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Three steps to absolute privacy. The server never sees your master password.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Step 1 */}
            <div className="group flex flex-col p-8 rounded-2xl bg-background border border-border shadow-sm hover:shadow-md transition-all hover:border-accent/30 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mb-8 border border-border group-hover:bg-accent/10 group-hover:border-accent/20 transition-colors">
                <Key className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="text-xl font-bold mb-3">1. Local Derivation</h3>
              <p className="text-muted-foreground leading-relaxed">
                Your master password is run through Argon2id locally in your browser, generating a strong encryption key that never leaves your device.
              </p>
            </div>

            {/* Step 2 */}
            <div className="group flex flex-col p-8 rounded-2xl bg-background border border-border shadow-sm hover:shadow-md transition-all hover:border-accent/30 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mb-8 border border-border group-hover:bg-accent/10 group-hover:border-accent/20 transition-colors">
                <Lock className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="text-xl font-bold mb-3">2. Encrypt Everything</h3>
              <p className="text-muted-foreground leading-relaxed">
                Vault items are encrypted using AES-256-GCM. What looks like sensitive data to you becomes cryptographically secure ciphertext.
              </p>
            </div>

            {/* Step 3 */}
            <div className="group flex flex-col p-8 rounded-2xl bg-background border border-border shadow-sm hover:shadow-md transition-all hover:border-accent/30 relative overflow-hidden">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mb-8 border border-border group-hover:bg-accent/10 group-hover:border-accent/20 transition-colors">
                <Shield className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="text-xl font-bold mb-3">3. Sync Ciphertext</h3>
              <p className="text-muted-foreground leading-relaxed">
                Only encrypted blobs are sent to our servers. Even if our database is compromised, your passwords remain mathematically secure.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border bg-background">
        &copy; {new Date().getFullYear()} Vault Password Manager. All rights reserved.
      </footer>
    </main>
  );
}

