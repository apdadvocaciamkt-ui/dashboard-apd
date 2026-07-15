import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "var(--bg)",
          surface: "var(--surface)",
          surface2: "var(--surface-2)",
          border: "var(--border)",
          text: "var(--text)",
          muted: "var(--muted)",
          accent: "var(--accent)",
          "accent-deep": "var(--accent-deep)",
          gold: "var(--gold)",
          danger: "var(--danger)",
        },
        stage: {
          aberto: "var(--stage-aberto)",
          mql: "var(--stage-mql)",
          ganho: "var(--stage-ganho)",
          perda: "var(--stage-perda)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
      },
      boxShadow: {
        card: "var(--shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
