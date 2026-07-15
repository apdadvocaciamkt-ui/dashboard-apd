import Dashboard from "@/components/Dashboard";

// Não cachear o HTML na borda (evita servir versões antigas após deploy).
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard />;
}
