import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/verbo/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Verbo Language Solutions" },
      {
        name: "description",
        content:
          "How Verbo Language Solutions handles data, local session state, and multi-tenant isolation for enterprise clients.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div
      className="relative min-h-screen antialiased"
      style={{ backgroundColor: "#0a0f14", WebkitFontSmoothing: "antialiased" } as React.CSSProperties}
    >
      <div className="verbo-tech-grid absolute inset-0 opacity-40 pointer-events-none" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:text-[#f38934]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home Page
        </Link>
        <Logo />
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-10">
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Privacy Policy — Verbo Language Solutions
        </h1>
        <p className="mt-4 text-sm uppercase tracking-[0.2em] text-white/40">
          Last updated · {new Date().getFullYear()}
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">01 — Data Minimization</h2>
          <p className="mt-4 leading-relaxed" style={{ color: "#cbd5e1" }}>
            The Verbo platform operates as a high-fidelity interactive state environment. It
            securely handles local session state using persistent <code className="rounded bg-white/5 px-1.5 py-0.5 text-[#f7b54a]">localStorage</code>,
            keeping your scheduling, performance, and progress data on your own device whenever
            possible. User profile graphics are processed strictly client-side via the JavaScript{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-[#f7b54a]">FileReader</code>{" "}
            API and converted into secure local Base64 string data URLs — your avatar never leaves
            your browser unless explicitly synchronized with your enterprise account.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">02 — Multi-Tenant Isolation</h2>
          <p className="mt-4 leading-relaxed" style={{ color: "#cbd5e1" }}>
            All student accounts, scheduled sessions, and recorded performance metrics are tightly
            restricted and private by design. Data is isolated securely per corporate tenant
            organization under the explicit enterprise-provisioned plan of the user's company.
            Cross-tenant access is structurally prevented at the routing, authentication, and data
            layer levels.
          </p>
        </section>

        <div className="mt-16 border-t border-white/5 pt-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:text-[#f38934]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home Page
          </Link>
        </div>
      </main>
    </div>
  );
}
