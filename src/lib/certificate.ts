import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
import medalUrl from "@/assets/certificate-medal.png";
import signatureUrl from "@/assets/jaret-signature.png";

/* -------------------------------------------------------------------------- */
/* Branded level-completion certificate (PDF) — the one PDF in this project    */
/* scoped for a fully different design track from the rest (landscape,        */
/* "Global Arc" concept: navy gradient, orbit rings, gold medal).             */
/*                                                                            */
/* Design approved by Jaret 2026-08-20 (2 HTML mockups reviewed, "Global Arc" */
/* concept chosen, then 3 rounds of live feedback — badges removed, tagline   */
/* in white, real signature + gold ribbon-medal artwork swapped in, slogan    */
/* watermark tried and reverted, signature/name repositioned twice — see      */
/* pdfs_funcionales_app_2026-08-20 in project memory). Renders the approved   */
/* HTML/CSS to a canvas via html2canvas and drops that image into a jsPDF     */
/* doc (same pipeline as receipt-pdf.ts / payroll-pdf.ts / simple-docs-pdf.ts)*/
/* rather than jsPDF's own vector drawing, so it matches the approved design  */
/* pixel-for-pixel. Trade-off, accepted: text is rasterized (not selectable), */
/* file is a bit heavier than the previous pure-vector version.               */
/* -------------------------------------------------------------------------- */

const PRODUCT_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  go: "GO",
  international: "International",
  spark: "Spark",
  next: "Next",
  vip: "VIP",
};

export function productDisplayName(product: string): string {
  return PRODUCT_LABELS[product?.toLowerCase?.() ?? ""] ?? (product || "Verbo");
}

export interface CertificateInput {
  studentName: string;
  levelName: string;
  product: string;
  completedAt?: Date;
  /** Optional — used to derive a stable certificate number (like the other
   *  docs' "VLA-XXX-000123" folios). Falls back to a hash of the name/level
   *  when omitted, so this still works from call sites that don't have it. */
  studentId?: string;
}

export function certificateFileName({ studentName, levelName }: CertificateInput): string {
  const slug = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
  return `verbo-certificate-${slug(studentName)}-${slug(levelName)}.pdf`;
}

/** Short, stable certificate number. Prefers the student's own id (same
 *  approach as docNumber() in simple-docs-pdf.ts); falls back to a simple
 *  deterministic hash of name+level so a folio is always available even
 *  when a call site doesn't have the id handy. */
function certificateNumber(input: CertificateInput): string {
  const seed = input.studentId || `${input.studentName}-${input.levelName}`;
  const digits = seed.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `VLA-CERT-${digits.padStart(6, "0").slice(-6)}`;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `VLA-CERT-${String(hash % 1000000).padStart(6, "0")}`;
}

/** Splits the student's name so the last word renders in the accent color,
 *  matching the approved mockup ("Andrea Villanueva" — last name in orange). */
function studentNameHtml(studentName: string): string {
  const parts = studentName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return `<span class="accent">${studentName}</span>`;
  const last = parts.pop();
  return `${parts.join(" ")} <span class="accent">${last}</span>`;
}

function buildHtml(input: CertificateInput): string {
  const { studentName, levelName, product } = input;
  const date = input.completedAt ?? new Date();
  const issuedLabel = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=open-sauce-sans@700,800&display=swap">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#e9e4da;}
  body{font-family:'Montserrat',sans-serif;}

  .cert{
    position:relative;
    width:1200px;height:849px;
    background:linear-gradient(155deg,#022e46 0%,#01304a 45%,#012338 100%);
    overflow:hidden;
  }

  /* ---- Orbit / globe arcs — the "global communication" motif ---- */
  .orbit{
    position:absolute;
    border-radius:50%;
    border:1.5px solid rgba(255,255,255,0.14);
  }
  .orbit-1{width:900px;height:900px;right:-360px;top:-300px;}
  .orbit-2{width:1140px;height:1140px;right:-460px;top:-420px;border-color:rgba(255,255,255,0.08);}
  .orbit-3{width:640px;height:640px;right:-230px;top:-190px;border-color:rgba(243,137,52,0.30);}

  .arc-sweep{
    position:absolute;right:-120px;bottom:-260px;
    width:680px;height:680px;border-radius:50%;
    background:conic-gradient(from 200deg at 50% 50%, #f38934 0deg, #ffcf8f 55deg, transparent 130deg 360deg);
    opacity:0.9;
    filter:blur(0.5px);
  }
  .arc-mask{
    position:absolute;right:-30px;bottom:-330px;
    width:560px;height:560px;border-radius:50%;
    background:linear-gradient(155deg,#022e46 0%,#01304a 45%,#012338 100%);
  }

  .dotline{
    position:absolute;left:64px;top:64px;bottom:64px;width:1px;
    background:repeating-linear-gradient(to bottom, rgba(255,255,255,0.22) 0 4px, transparent 4px 10px);
  }

  .content{
    position:relative;z-index:2;
    height:100%;
    display:flex;flex-direction:column;
    padding:64px 100px 50px 104px;
  }

  .brandrow{display:flex;align-items:center;gap:12px;}
  .brandrow img{width:42px;height:42px;border-radius:10px;display:block;}
  .brandrow .word .top{font-family:'Open Sauce Sans',sans-serif;font-weight:800;font-size:15px;letter-spacing:2px;color:#ffffff;}
  .brandrow .word .sub{font-family:'Montserrat',sans-serif;font-weight:600;font-size:7.5px;letter-spacing:2.6px;color:rgba(255,255,255,0.82);text-transform:uppercase;}

  .eyebrow{
    margin-top:56px;
    font-size:12px;font-weight:700;letter-spacing:5px;text-transform:uppercase;
    color:#f38934;
  }
  .headline{
    margin-top:10px;
    font-family:'Open Sauce Sans',sans-serif;
    font-weight:700;
    font-size:30px;
    letter-spacing:-0.2px;
    color:rgba(255,255,255,0.82);
    max-width:600px;
    line-height:1.2;
  }

  .presented{
    margin-top:34px;
    font-size:12.5px;color:rgba(255,255,255,0.55);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
  }
  .studentname{
    margin-top:14px;
    font-family:'Open Sauce Sans',sans-serif;
    font-weight:800;
    font-size:66px;
    color:#ffffff;
    line-height:1.03;
    letter-spacing:-0.5px;
  }
  .studentname .accent{color:#f38934;}

  .completion-line{
    margin-top:22px;
    font-size:14px;color:rgba(255,255,255,0.72);font-weight:500;
    max-width:560px;line-height:1.65;
  }
  .levelname{
    font-weight:800;
    color:#ffcf8f;
  }

  /* ---- Seal: gold ribbon-medal artwork ---- */
  .medal-wrap{
    position:absolute;
    right:100px;top:168px;
    width:168px;height:213px;
    z-index:3;
    filter:drop-shadow(0 16px 26px rgba(0,0,0,0.4));
  }
  .medal-wrap img{
    width:100%;height:100%;display:block;
  }

  /* ---- Footer ---- */
  .footer{
    margin-top:150px;
    width:100%;
    display:flex;align-items:flex-end;justify-content:space-between;
    padding-top:30px;
  }
  .sig{
    text-align:center;width:280px;
  }
  .sig .signature{
    height:132px;margin-bottom:-52px;display:flex;align-items:flex-end;justify-content:center;
    position:relative;z-index:2;
  }
  .sig .signature img{
    height:100%;width:auto;display:block;
    transform:translateY(16px);
  }
  .sig .line{
    height:1px;background:rgba(255,255,255,0.28);
    margin-bottom:8px;position:relative;z-index:1;
  }
  .sig .name{
    font-family:'Open Sauce Sans',sans-serif;font-weight:700;
    font-size:17px;color:#ffffff;
  }
  .sig .role{
    font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:600;margin-top:4px;
  }

  .verify{
    text-align:right;
  }
  .verify .id{
    font-size:10px;color:rgba(255,255,255,0.5);font-weight:600;letter-spacing:0.5px;
  }
  .verify .date{
    font-size:10.5px;color:#ffffff;font-weight:700;margin-top:3px;
  }
</style>
</head>
<body>

<div class="cert">
  <div class="orbit orbit-2"></div>
  <div class="orbit orbit-1"></div>
  <div class="orbit orbit-3"></div>
  <div class="arc-sweep"></div>
  <div class="arc-mask"></div>
  <div class="dotline"></div>

  <div class="content">
    <div class="brandrow">
      <img src="${logoUrl}" alt="Verbo">
      <div class="word">
        <div class="top">VERBO</div>
        <div class="sub">Language Solutions</div>
      </div>
    </div>

    <div class="eyebrow">Certificate of Completion</div>
    <div class="headline">Global Communication in English</div>

    <div class="presented">This certifies that</div>
    <div class="studentname">${studentNameHtml(studentName)}</div>

    <div class="completion-line">
      has successfully completed <span class="levelname">${levelName}</span>
      of the ${productDisplayName(product)} Program, demonstrating consistent growth in spoken
      and written English communication.
    </div>

    <div class="medal-wrap">
      <img src="${medalUrl}" alt="Verbo Certified Medal">
    </div>

    <div class="footer">
      <div class="sig">
        <div class="signature"><img src="${signatureUrl}" alt="Firma"></div>
        <div class="line"></div>
        <div class="name">Jaret Ramírez</div>
        <div class="role">Founder &amp; Director</div>
      </div>
      <div class="verify">
        <div class="id">Certificate No. ${certificateNumber(input)}</div>
        <div class="date">Issued ${issuedLabel}</div>
      </div>
    </div>
  </div>
</div>

</body></html>`;
}

/** Renders the certificate off-screen and triggers a download. */
export async function generateLevelCertificate(input: CertificateInput): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = buildHtml(input);
  document.body.appendChild(container);
  const pageEl = container.querySelector(".cert") as HTMLElement;

  try {
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#01304a",
    });
    const imgData = canvas.toDataURL("image/png");

    // Unlike receipt/payroll/simple-docs (variable-height content sliced
    // across Letter pages), this artwork is a fixed 1200x849 layout — so the
    // PDF page is sized to match the canvas exactly (unit "px", format =
    // canvas dimensions) instead of forcing it into a4's slightly different
    // aspect ratio, which left a near-blank sliver second page in testing.
    const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    doc.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

    doc.save(certificateFileName(input));
  } finally {
    document.body.removeChild(container);
  }
}
