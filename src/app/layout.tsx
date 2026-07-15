import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard APD",
  description: "Métricas de Meta Ads, Google Ads e LiderHub do cliente APD",
};

const THEME_INIT = `
(function () {
  try {
    var saved = localStorage.getItem("apd-theme");
    document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
