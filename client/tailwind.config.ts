import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#4f46e5",
        "primary-dark": "#3730a3",
        "primary-light": "#eef2ff",
        "primary-border": "#c7d2fe",
        secondary: "#7c3aed",
        "bg-base": "#f8fafc",
        surface: "#ffffff",
        "border-light": "#e2e8f0",
        "border-dark": "#cbd5e1",
        "text-main": "#0f172a",
        "text-body": "#475569",
        "text-meta": "#94a3b8",
        success: "#10b981",
        "success-bg": "#ecfdf5",
        "success-border": "#a7f3d0",
        "success-text": "#047857",
        warning: "#f59e0b",
        "warning-bg": "#fffbeb",
        "warning-border": "#fde68a",
        "warning-text": "#b45309",
        danger: "#f43f5e",
        "danger-bg": "#fff1f2",
        "danger-border": "#fecdd3",
        "danger-text": "#be123c",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "md": "0.375rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "full": "9999px",
        "input": "10px",
        "btn": "10px",
        "modal": "20px"
      },
      spacing: {
        "section-py": "96px",
        "card-p": "28px",
        "gutter": "24px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      }
    }
  },
  plugins: [],
};

export default config;
