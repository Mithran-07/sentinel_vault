import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      colors: {
        background: "#0a0a0a", // near-black
        foreground: "#ededed",
        surface: "#171717", // slightly lighter for cards/modals
        surfaceHover: "#262626",
        border: "#333333",
        accent: {
          DEFAULT: "#10b981", // Emerald 500
          hover: "#059669",   // Emerald 600
        },
      },
    },
  },
  plugins: [],
};

export default config;
