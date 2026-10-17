import type { Config } from "tailwindcss";

/**
 * Sentinel Precision — Design System Tokens
 * All tokens map to RGB CSS variables in globals.css, allowing seamless
 * dark / light switching and full Tailwind opacity modifier support (e.g. `bg-accent/10`).
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Semantic Neutral Scale ────────────────────────────────────────
        canvas: v("canvas"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        line: v("line"),
        "line-strong": v("line-strong"),
        fg: v("fg"),
        "fg-muted": v("fg-muted"),
        "fg-subtle": v("fg-subtle"),

        // ── Precision Accents ─────────────────────────────────────────────
        accent: v("accent"),
        "accent-strong": v("accent-strong"),
        "on-accent": v("on-accent"),
        cyan: v("cyan"),
        uv: v("uv"),
        lime: v("lime"),

        // ── Semantic States ───────────────────────────────────────────────
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
        info: v("info"),
        focus: v("accent"),

        // ── Backward-compatible Aliases ───────────────────────────────────
        primary: v("accent"),
        "primary-dark": v("accent-strong"),
        "primary-light": "rgb(var(--c-accent) / 0.10)",
        "primary-border": "rgb(var(--c-accent) / 0.30)",
        secondary: v("uv"),
        background: v("canvas"),
        foreground: v("fg"),
        text: v("fg"),
        "text-muted": v("fg-muted"),
        "text-main": v("fg"),
        "text-body": v("fg-muted"),
        "text-meta": v("fg-subtle"),
        "text-primary": v("fg"),
        "text-secondary": v("fg-muted"),
        border: v("line"),
        "border-light": v("line"),
        "border-dark": v("line-strong"),
        "border-border": v("line"),
        surfaceHover: v("surface-3"),
        "accent-primary": v("cyan"),
        "accent-secondary": v("uv"),
        "accent-positive": v("success"),
        "surface-elevated": v("surface-2"),
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        xs: "0.1875rem",
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
        input: "6px",
        btn: "6px",
        panel: "10px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["'Space Grotesk'", "Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "15px", letterSpacing: "0.02em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["18px", { lineHeight: "26px", letterSpacing: "-0.015em" }],
        "2xl": ["20px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "3xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.025em" }],
        "4xl": ["32px", { lineHeight: "38px", letterSpacing: "-0.03em" }],
        "5xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.035em" }],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        panel: "0 1px 1px 0 rgb(0 0 0 / 0.12), 0 0 0 1px rgb(var(--c-line))",
        popover: "0 8px 30px -4px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(var(--c-line-strong))",
        subtle: "0 1px 3px rgb(0 0 0 / 0.2)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(3px) scale(0.99)" }, to: { opacity: "1", transform: "none" } },
        "slide-right": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        "slide-left": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "pop-in": "pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-right": "slide-right 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-left": "slide-left 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
