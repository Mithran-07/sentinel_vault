import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VaultProvider } from "@/context/VaultContext";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Sentinel Vault — Zero-knowledge credential security",
  description:
    "Protect, organize and share your digital credentials through a security-first vault designed around privacy and control.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0F17" },
    { media: "(prefers-color-scheme: light)", color: "#F5F7FB" },
  ],
};

// Runs before first paint to apply the persisted theme and avoid a flash.
// Only reads a non-sensitive UI preference from localStorage.
const themeInit = `(function(){try{var t=localStorage.getItem('sv-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}var c=document.documentElement.classList;c.remove('light','dark');c.add(t);}catch(e){document.documentElement.classList.add('dark')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-canvas text-fg min-h-screen">
        <VaultProvider>
          <ToastProvider>{children}</ToastProvider>
        </VaultProvider>
      </body>
    </html>
  );
}
