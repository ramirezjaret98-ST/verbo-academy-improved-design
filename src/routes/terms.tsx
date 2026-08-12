import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/verbo/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | Verbo Language Solutions" },
      {
        name: "description",
        content:
          "What's included in your access, how scheduling and cancellations work, and what's allowed and not allowed on the Verbo Language Solutions platform.",
      },
    ],
  }),
  component: TermsPage,
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

function RuleList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "allowed" | "prohibited";
  items: React.ReactNode[];
}) {
  const color = tone === "allowed" ? "#5fca16" : "#f38934";
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color }}>
        {title}
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            <span aria-hidden style={{ color }}>
              {tone === "allowed" ? "✓" : "✕"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermsPage() {
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
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-sm uppercase tracking-[0.2em] text-white/40">
          Last updated · {new Date().getFullYear()}
        </p>

        <P>
          This page explains, in plain language, what you can expect from Verbo Language
          Solutions and what we expect from you as a student on the platform. If you signed a
          separate service agreement with us (for example, for an Enterprise, GO, International,
          or VIP program), that agreement covers your specific pricing, package, and payment
          terms. These Terms &amp; Conditions cover how the platform itself works and how we
          expect everyone to behave on it. If the two ever conflict on a specific point, your
          signed agreement takes priority.
        </P>

        <section className="mt-12">
          <SectionTitle>01. Your Account</SectionTitle>
          <P>
            Your account is personal and yours alone. Don't share your login with anyone else,
            and don't use someone else's account, including a classmate's, a coworker's, or a
            family member's. You're responsible for anything that happens under your account, so
            keep your password private and let us know right away if you think someone else has
            access to it.
          </P>
          <P>
            When an administrator sets up a new account for you, you'll be asked to change your
            temporary password the first time you log in. That's a one-time step to make sure
            only you know your password going forward.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>02. What's Included In Your Access</SectionTitle>
          <P>
            Verbo runs several programs (Enterprise, GO, International, and VIP/Tailored Content),
            and within each one you're enrolled in a specific access plan (Core, Advance, Elite,
            or Signature) that determines things like how many sessions, clubs, and workshops you
            can book per month. The exact package you're entitled to, including number of
            sessions, levels, duration, and price, is the one described in your enrollment or
            your company's service agreement, not this page. This page covers the rules of using
            the platform itself.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>03. Scheduling, Rescheduling &amp; Cancellations</SectionTitle>
          <P>
            Any cancellation or rescheduling request must go exclusively through Verbo Academy's
            official channels (see Contact Us, Section 13). We don't process these directly with
            a teacher. We're committed to always securing and honoring your scheduled time slot,
            but moving a session to a new time is subject to availability, and it doesn't come
            with any compensation if a preferred new time isn't available.
          </P>
          <P>
            Sessions, clubs, and workshops need to be booked, changed, or cancelled at least{" "}
            <strong className="text-white">24 hours in advance</strong>. This applies no matter
            the reason, including work commitments, personal matters, or anything else. We know
            that's not always convenient, but it's what lets us keep schedules fair for teachers
            and other students, and it applies the same way to everyone.
          </P>
          <P>
            You have <strong className="text-white">30 calendar days</strong> from a session's
            original date to reschedule it. Once that window closes, the session can no longer be
            rescheduled and is not refundable.
          </P>
          <P>
            Some session types (like Spotlight Sessions) are limited-availability and tied
            directly to a teacher's time. If you cancel one of these with less than 24 hours'
            notice, you lose the session credit and we may apply a late-cancellation charge.
            Converting a group session into a Spotlight Session doesn't refund the credit either,
            since the seat is already reserved for you.
          </P>
          <P>
            You're responsible for having a stable internet connection, a working device, and an
            up-to-date video call app for your sessions. If you miss a session or show up late
            because of a problem on your end (bad connection, an old device, an outdated app),
            that session still counts as delivered, and we won't automatically reschedule or
            refund it. If the problem is on our side (a platform outage, a teacher not showing up,
            and similar cases), we'll make it right and reschedule at no cost to you.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>04. Payments</SectionTitle>
          <P>
            Payment terms, due dates, and what happens if a payment is late are set out in your
            enrollment or your company's service agreement, and we'll always tell you clearly if
            access is at risk because of an unpaid balance before we act on it. Your payment
            obligations don't change based on personal, financial, or work circumstances. If
            you're going through something difficult, talk to us. We may be able to work
            something out, but that's a courtesy we offer at our discretion, not something built
            into these Terms.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>05. Working With Teachers &amp; Staff</SectionTitle>
          <P>
            Everything related to payments, rescheduling, changes to your plan, or special
            requests needs to go through Verbo's official channels, not directly with a teacher,
            even informally, even outside class hours. This applies to every member of our team,
            without exception. Any arrangement that isn't confirmed in writing by our
            administrative team doesn't count, no matter who agreed to it verbally.
          </P>
          <RuleList
            title="Not allowed"
            tone="prohibited"
            items={[
              "Asking a teacher directly for a discount, a makeup class, or a schedule change instead of going through official channels.",
              <>
                Offering, arranging, or accepting private lessons with a Verbo teacher outside the
                platform, during your enrollment and for 12 months after it ends. This is a
                serious violation and can result in immediate account termination without refund.
              </>,
            ]}
          />
        </section>

        <section className="mt-10">
          <SectionTitle>06. Conduct &amp; Community Standards</SectionTitle>
          <P>
            We want every session, club, and workshop to feel safe and professional for students,
            teachers, and staff alike.
          </P>
          <RuleList
            title="Allowed"
            tone="allowed"
            items={[
              "Treating teachers, staff, and other students with respect, the same way you'd expect to be treated.",
              "Giving honest feedback about your sessions and materials through the official feedback and reporting tools.",
              "Using session recordings or materials for your own personal study.",
            ]}
          />
          <RuleList
            title="Not allowed"
            tone="prohibited"
            items={[
              "Harassment, discrimination, or disrespectful language toward anyone on the platform.",
              "Recording, downloading, redistributing, or publishing sessions or course materials without our written permission.",
              "Sharing your login, or using another student's account to attend sessions or complete activities.",
              "Trying to access data, accounts, or areas of the platform that aren't yours.",
              "Scraping, reverse-engineering, or otherwise probing the platform outside of normal use.",
            ]}
          />
          <P>
            If something goes wrong, we handle it in steps: a first issue usually gets a written
            warning; a repeat issue or something serious (harassment, sharing an account,
            unauthorized recording, and similar cases) can lead to suspension or termination of
            your account without a refund.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>07. Course Content &amp; Intellectual Property</SectionTitle>
          <P>
            All course materials, curricula, activities, and content on the platform belong to
            Verbo Language Solutions. Your access gives you a personal license to use them for
            your own learning. It isn't a license to copy, resell, or share them with anyone
            else, during your enrollment or afterward.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>08. Teacher Assignment</SectionTitle>
          <P>
            We may assign, rotate, or substitute teachers as needed to keep your sessions running
            reliably. That's part of how we operate the platform and isn't a change to your plan
            or a breach of your agreement.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>09. No Guaranteed Results</SectionTitle>
          <P>
            Verbo is committed to giving you a well-structured program and qualified teachers, but
            how quickly you improve depends on a lot of factors we don't control, like how much
            you practice, your starting point, and your consistency, among others. We don't
            guarantee a specific outcome, score, or timeline, and we make reasonable efforts to
            keep the platform available and reliable but can't promise it will be free of
            interruptions.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>10. Suspension &amp; Termination</SectionTitle>
          <P>
            We can suspend or terminate access to the platform for violations of these Terms, for
            unresolved non-payment under your service agreement, or for conduct that puts other
            students, teachers, or staff at risk. Where these Terms say a violation costs you your
            refund or credit, that's what applies. The specific financial terms of ending your
            enrollment early are set out in your service agreement.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>11. Changes To These Terms</SectionTitle>
          <P>
            We may update these Terms from time to time as the platform evolves. When we make a
            meaningful change, we'll update the date at the top of this page and let you know
            through the platform or by email. Continuing to use Verbo after a change means you
            accept the updated Terms.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>12. Governing Law &amp; Disputes</SectionTitle>
          <P>
            These Terms are governed by the laws of Mexico. Any dispute that can't be resolved
            directly between you and Verbo will be submitted to the courts of Apizaco, Tlaxcala,
            Mexico, and both parties waive any other jurisdiction that might otherwise apply,
            including for students located outside of Mexico.
          </P>
        </section>

        <section className="mt-10">
          <SectionTitle>13. Contact Us</SectionTitle>
          <P>Questions about these Terms, or about your account? Reach us through:</P>
          <ul className="mt-4 space-y-2 pl-1 text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            <li>
              <span className="text-white/80">WhatsApp (official line):</span>{" "}
              <a href="https://wa.me/522461152136" className="text-[#f7b54a] hover:underline">
                (+52) 246 115 2136
              </a>
            </li>
            <li>
              <span className="text-white/80">General inquiries:</span>{" "}
              <a href="mailto:info@verbolanguagesolutions.com" className="text-[#f7b54a] hover:underline">
                info@verbolanguagesolutions.com
              </a>
            </li>
            <li>
              <span className="text-white/80">Academic / scheduling matters:</span>{" "}
              <a href="mailto:academic@verbolanguagesolutions.com" className="text-[#f7b54a] hover:underline">
                academic@verbolanguagesolutions.com
              </a>
            </li>
          </ul>
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
