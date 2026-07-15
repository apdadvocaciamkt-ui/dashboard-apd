import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Não cachear o HTML da home na borda (evita servir versão antiga após deploy).
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

// Disponibiliza os bindings do Cloudflare (D1 etc.) durante `next dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
