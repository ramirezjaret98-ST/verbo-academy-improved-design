import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Logo } from "@/components/verbo/Logo";
import { Footer } from "@/components/verbo/Footer";
import { Preloader } from "@/components/verbo/Preloader";
import { ArrowRight, Gift, MessageCircle, MessageSquare, Zap } from "lucide-react";
import heroImage from "@/assets/hero_image.png.asset.json";
import yellowCardImage from "@/assets/yello_card_image.webp.asset.json";
import purpleCardImage from "@/assets/purple_card_image.webp.asset.json";
import redCardImage from "@/assets/red_card_image.webp.asset.json";
import greenCardImage from "@/assets/green_card_image.webp.asset.json";
import navyCardImage from "@/assets/navy_card_image.webp.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Verbo Language Solutions — The Language of Global Growth" },
      { name: "description", content: "Premium B2B English training for global teams. Private platform with live sessions, structured curriculum and measurable progress." },
      { property: "og:title", content: "Verbo Language Solutions" },
      { property: "og:description", content: "The Language of Global Growth." },
    ],
  }),
  component: Landing,
});

/** Scroll reveal for a group: the container drives a 70ms stagger over its
 *  children, so the bento builds itself instead of appearing all at once.
 *  Decorative only — content is rendered and interactive from the start. */
const revealGroup: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/** Child reveal. `reduce` drops the movement and keeps the opacity bridge. */
function revealItem(reduce: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.2 : 0.5, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

type BenefitCardProps = {
  gradient: string;
  tone: "navy" | "light";
  imageSide: "left" | "right" | "bottom";
  title: React.ReactNode;
  body: React.ReactNode;
  variants: Variants;
  className?: string;
  image?: { src: string; alt: string };
  artClassName?: string;
  watermarks?: React.ReactNode;
};


/** Colored benefit card with an oversized cut-out that overflows the card edges. */
function BenefitCard({
  gradient,
  tone,
  imageSide,
  title,
  body,
  variants,
  className = "",
  image,
  artClassName = "",
  watermarks,
}: BenefitCardProps) {
  const titleColor = tone === "light" ? "text-white" : "text-[var(--navy-900)]";
  const bodyColor = tone === "light" ? "text-white/85" : "text-[var(--navy-900)]/80";
  const isBottom = imageSide === "bottom";

  const art = image ? (
    <>
      {/* Mobile: la foto fluye debajo del texto, completa */}
      <div className="mt-6 h-52 w-full sm:hidden">
        <img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          className="h-full w-full object-contain object-bottom drop-shadow-[0_18px_28px_rgba(1,48,74,0.22)]"
        />
      </div>
      {/* Desktop: recorte gigante anclado al piso de la tarjeta, puede desbordar sus bordes */}
      <img
        src={image.src}
        alt={image.alt}
        loading="lazy"
        className={`pointer-events-none absolute z-0 hidden w-auto max-w-none drop-shadow-[0_18px_28px_rgba(1,48,74,0.22)] transition-transform duration-300 ease-out group-hover:-translate-y-1 sm:block ${artClassName}`}
      />
    </>
  ) : null;






  const textAlign = isBottom
    ? "sm:mx-auto sm:max-w-[26rem] sm:text-center"
    : imageSide === "left"
      ? "sm:ml-auto sm:w-[52%] sm:text-right"
      : "sm:mr-auto sm:w-[52%]";

  return (
    <motion.div
      variants={variants}
      className={`group relative flex min-h-[280px] flex-col rounded-[2rem] ${gradient} shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-[6px] hover:shadow-card-hover ${className}`}
    >
      {watermarks && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem] text-white"
        >
          {watermarks}
        </div>
      )}

      <div className={`relative z-10 flex flex-col p-8 ${textAlign}`}>
        <h3 className={`text-2xl font-bold leading-tight tracking-tight ${titleColor}`}>{title}</h3>
        <p className={`mt-3 text-sm leading-relaxed ${bodyColor}`}>{body}</p>
      </div>

      {art}

    </motion.div>
  );
}




function Landing() {
  const reduce = useReducedMotion() ?? false;
  const item = revealItem(reduce);

  return (
    <>
      <Preloader />
      <div className="font-marketing min-h-screen bg-background">
        {/* Nav */}
        <header className="sticky top-0 z-30 border-b border-[var(--navy-700)]/8 bg-white/75 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 shadow-[0_1px_0_rgba(1,48,74,0.04),0_8px_24px_-16px_rgba(1,48,74,0.15)]">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <Logo />
            <span className="verbo-spin-ring">
              <Link
                to="/login"
                className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-transform duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
              >
                Sign in
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
              </Link>
            </span>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="relative overflow-hidden bg-secondary">
            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:py-28">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                {/* Left: photo composition */}
                <div
                  className="verbo-fade-up relative mx-auto h-[598px] w-full max-w-[552px]"
                  style={{ animationDelay: "0ms" }}
                >
                  <img
                    src={heroImage.url}
                    alt="Professional students with notebooks and backpack ready to learn"
                    className="h-full w-full object-contain"
                  />
                </div>

                {/* Right: text */}
                <div>
                  <h1
                    className="verbo-fade-up text-5xl font-semibold tracking-tight text-[var(--navy-700)] md:text-6xl"
                    style={{ animationDelay: "80ms", textWrap: "balance" }}
                  >
                    Growth has a language.
                    <span className="text-[var(--orange-500)]"> Speak it.</span>
                  </h1>

                  <p
                    className="verbo-fade-up mt-6 text-lg leading-relaxed text-[var(--navy-700)]/75 whitespace-pre-line"
                    style={{ animationDelay: "160ms" }}
                  >
                    A flexible, practical English experience designed around you.
                    {"\n"}Forget about outdated textbooks and boring grammar rules.
                    {"\n"}At Verbo Academy, you’re in control: you decide what to learn and how to do it. Choose from a wide selection of hand-picked content and learn at your own pace
                  </p>

                  <div
                    className="verbo-fade-up mt-10 flex flex-wrap items-center gap-3"
                    style={{ animationDelay: "240ms" }}
                  >
                    <Link
                      to="/login"
                      className="group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-elevated transition-[transform,box-shadow,opacity] duration-150 ease-out hover:-translate-y-0.5 hover:opacity-95 hover:shadow-floating active:scale-[0.97] active:translate-y-0"
                    >
                      Access your account
                      <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                    </Link>
                    <Link
                      to="/"
                      hash="how"
                      className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[var(--navy-700)]/15 bg-white px-6 py-3 text-sm font-medium text-[var(--navy-700)] shadow-soft transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-elevated active:scale-[0.97] active:translate-y-0"
                    >
                      Explore benefits
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Benefits */}
          <section id="how" className="relative overflow-hidden bg-secondary">
            <div className="mx-auto max-w-[88rem] px-6 py-24 lg:py-32">
              <div className="mb-16 max-w-4xl">
                <h2
                  className="verbo-fade-up text-3xl font-semibold tracking-tight text-[var(--navy-700)] md:text-5xl"
                  style={{ animationDelay: "0ms", textWrap: "balance" }}
                >
                  <span className="text-[var(--orange-500)]">Built around you,</span> not
                  <br className="hidden md:block" /> the other way around.
                </h2>
                <p
                  className="verbo-fade-up mt-5 text-lg leading-relaxed text-[var(--navy-700)]/70"
                  style={{ animationDelay: "80ms" }}
                >
                  Learning designed around your routine, not the other way around. Study on your
                  time, practice with purpose, and see results that stick
                </p>
              </div>

              <motion.div
                className="grid gap-5 md:grid-cols-2 lg:grid-cols-[4fr_4fr_3fr] lg:grid-rows-2"
                variants={revealGroup}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.18 }}
              >
                <BenefitCard
                  gradient="card-gradient-gold"
                  tone="navy"
                  imageSide="left"
                  variants={item}
                  image={{ src: yellowCardImage.url, alt: "Student learning on his phone" }}
                  artClassName="sm:left-[-5%] sm:bottom-[-7%] sm:h-[102%]"
                  title="Learn on Your Own Terms"
                  body={
                    <>
                      Access content <strong className="font-bold">24/7, 365</strong>, from any
                      device, <strong className="font-bold">anywhere in the world</strong>.
                      <span className="mt-3 block">You decide what to do and what not to do.</span>
                    </>
                  }
                />

                <BenefitCard
                  gradient="card-gradient-orchid"
                  tone="navy"
                  imageSide="right"
                  variants={item}
                  image={{ src: purpleCardImage.url, alt: "Two people talking in English" }}
                  artClassName="sm:right-0 sm:bottom-[-4%] sm:h-[92%]"
                  watermarks={
                    <>
                      <MessageCircle
                        className="absolute -left-6 top-6 h-40 w-40 opacity-[0.08]"
                        strokeWidth={1.5}
                      />
                      <MessageSquare
                        className="absolute bottom-4 left-24 h-24 w-24 opacity-[0.08]"
                        strokeWidth={1.5}
                      />
                    </>
                  }
                  title="Speak with confidence, not pressure"
                  body={
                    <>
                      Join <strong className="font-bold">Insights &amp; Book Clubs</strong> with
                      people sharing your exact level and goals. Organic Networking while you
                      practice.
                    </>
                  }
                />

                <BenefitCard
                  gradient="card-gradient-crimson"
                  tone="light"
                  imageSide="bottom"
                  variants={item}
                  className="md:col-span-2 lg:col-span-1 lg:row-span-2"
                  image={{ src: redCardImage.url, alt: "Students taking on challenges together" }}
                  artClassName="sm:left-1/2 sm:-translate-x-1/2 sm:bottom-0 sm:h-[64%]"
                  
                  watermarks={
                    <>
                      <Zap
                        className="absolute -left-10 top-1/4 h-72 w-72 rotate-6 opacity-[0.08]"
                        strokeWidth={1.2}
                      />
                      <Gift
                        className="absolute -right-10 top-8 h-56 w-56 -rotate-12 opacity-[0.08]"
                        strokeWidth={1.2}
                      />
                    </>
                  }

                  title="Level Up with Fun Challenges"
                  body={
                    <>
                      Take on interactive mini-challenges designed to make practice fun. Complete
                      tasks, climb the leaderboards, and share your progress with the community.
                    </>
                  }
                />

                <BenefitCard
                  gradient="card-gradient-lime"
                  tone="navy"
                  imageSide="right"
                  variants={item}
                  image={{ src: greenCardImage.url, alt: "Student celebrating her progress" }}
                  artClassName="sm:right-0 sm:bottom-[-7%] sm:h-[102%]"
                  title="Track real, tangible progress"
                  body={
                    <>
                      <strong className="font-bold">Clear milestones and visual tracking</strong> so
                      you always know where you stand and how far you&apos;ve come.
                    </>
                  }
                />

                <BenefitCard
                  gradient="card-gradient-navy"
                  tone="light"
                  imageSide="left"
                  variants={item}
                  image={{ src: navyCardImage.url, alt: "Verbo Academy instructors" }}
                  artClassName="sm:left-[-2%] sm:bottom-[-2%] sm:h-[97%]"
                  

                  title={<><span className="sm:whitespace-nowrap">Guided by expert</span><br />Instructors</>}
                  body={
                    <>
                      Learn from{" "}
                      <strong className="font-bold">qualified, human instructors</strong> who
                      provide real-time feedback and support your personal journey.
                    </>
                  }
                />
              </motion.div>

            </div>
          </section>


          {/* Closing CTA */}
          <section className="relative overflow-hidden bg-white">
            <motion.div
              className="mx-auto max-w-4xl px-6 py-24 text-center lg:py-28"
              variants={revealGroup}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <motion.h2 variants={item} className="text-3xl font-semibold tracking-tight text-[var(--navy-700)] md:text-4xl" style={{ textWrap: "balance" }}>
                Your team is one conversation away from a stronger year.
              </motion.h2>
              <motion.p variants={item} className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--navy-700)]/70 md:text-lg">
                Step back into the platform and pick up exactly where you left off — sessions,
                progress, and materials, all in one place.
              </motion.p>
              <motion.div variants={item} className="mt-10 flex justify-center">
                <Link
                  to="/login"
                  className="group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-accent-foreground shadow-elevated transition-[transform,box-shadow,opacity] duration-150 ease-out hover:-translate-y-0.5 hover:opacity-95 hover:shadow-floating active:scale-[0.97] active:translate-y-0"
                >
                  Access your account
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            </motion.div>
          </section>

          {/* Footer */}
          <Footer />

        </main>
      </div>
    </>
  );
}
