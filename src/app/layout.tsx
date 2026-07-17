import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

// Fonte predominante da agência hoje — aplicada só nos lugares-chave que já
// usam serifa (marca na sidebar, título de página), não no corpo/interface.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

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
    <html lang="pt-BR" className={playfair.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
