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
          "What personal data Verbo Language Solutions collects, why, who can see it, and how to exercise your privacy rights.",
      },
    ],
  }),
  component: PrivacyPage,
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-white">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 leading-relaxed" style={{ color: "#cbd5e1" }}>
      {children}
    </p>
  );
}

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
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm uppercase tracking-[0.2em] text-white/40">
          Last updated · {new Date().getFullYear()}
        </p>

        <P>
          This page explains, in plain language, what personal information Verbo Language
          Solutions collects when you use our platform, why we collect it, who can see it, and
          what choices you have about it. It applies to students, teachers, and anyone else with
          an account on the platform.
        </P>

        <section className="mt-12">
          <SectionTitle>01 — Who's Responsible For Your Data</SectionTitle>
          <P>
            Your data is handled by{" "}
            <span className="text-white/80">Verbo Language Solutions, S.A.S.</span> (
            <span className="text-white/70">[RFC DE VERBO LANGUAGE SOLUTIONS]</span>,{" "}
            <span className="text-white/70">[DOMICILIO FISCAL DE VERBO LANGUAGE SOLUTIONS]</span>
            ), the company behind this platform. If you ever want to reach us about your data
            specifically, use the contact details in Section 08 below.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>02 — What We Collect</SectionTitle>
          <P>We only collect what we actually need to run the platform and your program:</P>
          <ul className="mt-4 space-y-2 pl-1 text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            <li>
              <span className="text-white/80">Account &amp; profile information</span> — your
              name, email, company (if you're enrolled through an employer), and a profile picture
              if you choose to add one.
            </li>
            <li>
              <span className="text-white/80">Program information</span> — the product, level,
              and plan you're enrolled in, your schedule, attendance, and your progress through
              activities, courses, and challenges.
            </li>
            <li>
              <span className="text-white/80">Session &amp; feedback records</span> — notes and
              performance ratings your teacher leaves after a session, and any conduct or content
              reports involving your account.
            </li>
            <li>
              <span className="text-white/80">Billing status</span> — whether your account is up
              to date, overdue, or paused. We don't store your card or bank details ourselves;
              payments go through the payment methods we publish through our official channels.
            </li>
            <li>
              <span className="text-white/80">Basic technical information</span> — things like
              login times, used to keep your account secure and to troubleshoot problems you
              report to us.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <SectionTitle>03 — Why We Collect It</SectionTitle>
          <P>We use your information to:</P>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            <li>Create and manage your account, and get you into your sessions, clubs, and workshops.</li>
            <li>Track your progress and give your teacher and our administrators the context they need to support you.</li>
            <li>Communicate with you about your schedule, your account, or your program.</li>
            <li>Keep the platform secure and address issues you report.</li>
            <li>Meet our legal, accounting, and tax obligations.</li>
          </ul>
          <P>
            We don't use your information for advertising, and we don't sell it to anyone — that's
            not something we do, now or in the future.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>04 — Who Can See Your Information</SectionTitle>
          <P>
            Access is limited to what each role actually needs. Your assigned teacher can see
            your schedule, progress, and session notes. Verbo administrators can see account and
            program information across the platform, to run day-to-day operations and support.
            Other students can't see your personal information, your progress, or your session
            notes.
          </P>
          <P>
            If you're enrolled through your employer under a company plan, your employer's
            designated contact may receive summary attendance or progress information as part of
            the service agreement Verbo has with them — never your session notes or anything
            beyond what that agreement covers.
          </P>
          <P>
            We also work with service providers that host our platform and database on our
            behalf. They only process data to keep the platform running and are bound to keep it
            confidential — they don't get to use it for their own purposes.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>05 — How We Protect It</SectionTitle>
          <P>
            Your connection to the platform is encrypted, accounts are protected by individual
            logins, and access to student and teacher information is limited to the staff who
            need it to do their jobs — a teacher, for example, only sees the students assigned to
            them. We monitor for suspicious activity and take reasonable, industry-standard steps
            to keep your information safe.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>06 — How Long We Keep It</SectionTitle>
          <P>
            We keep your information while your account is active, and for a reasonable period
            afterward to meet accounting, tax, and legal recordkeeping obligations. After that, we
            delete or anonymize it.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>07 — Your Rights</SectionTitle>
          <P>Under Mexican data protection law, you can ask us at any time to:</P>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            <li><span className="text-white/80">Access</span> the personal data we hold about you.</li>
            <li><span className="text-white/80">Correct</span> it, if it's outdated or inaccurate.</li>
            <li><span className="text-white/80">Delete</span> it, once we no longer need it for the purposes above or for a legal obligation.</li>
            <li><span className="text-white/80">Object</span> to a specific use of it.</li>
          </ul>
          <P>
            To exercise any of these rights, reach out through Section 08 below. We'll confirm
            we've received your request and respond within the timeframe the law gives us.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>08 — Contact Us</SectionTitle>
          <P>
            Questions about this policy, or about your data? Reach us through the official
            channels listed in the footer of this site (WhatsApp, or our social media pages), or
            through your assigned administrator.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>09 — Changes To This Policy</SectionTitle>
          <P>
            If we make a meaningful change to how we handle your information, we'll update the
            date at the top of this page and let you know through the platform or by email.
          </P>
        </section>

        <div className="mt-16 border-t border-white/5 pt-8">
          <p className="text-xs leading-relaxed text-white/30">
            This document is a legal base prepared with the assistance of AI for Verbo Language
            Solutions. We recommend it be reviewed by a licensed Mexican corporate attorney before
            being relied on as your final, published privacy notice.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:text-[#f38934]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home Page
          </Link>
        </div>
      </main>
    </div>
  );
}
