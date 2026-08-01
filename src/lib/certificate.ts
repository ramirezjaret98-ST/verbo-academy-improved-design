import { jsPDF } from "jspdf";

/* -------------------------------------------------------------------------- */
/* Branded level-completion certificate (PDF, visual-only artifact)            */
/* -------------------------------------------------------------------------- */

const NAVY: [number, number, number] = [1, 48, 74];
const ORANGE: [number, number, number] = [243, 137, 52];
const WHITE: [number, number, number] = [255, 255, 255];
const MUTED: [number, number, number] = [203, 213, 225];

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
}

export function certificateFileName({ studentName, levelName }: CertificateInput): string {
  const slug = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
  return `verbo-certificate-${slug(studentName)}-${slug(levelName)}.pdf`;
}

/** Builds the branded certificate PDF and triggers a download. */
export function generateLevelCertificate(input: CertificateInput): void {
  const { studentName, levelName, product } = input;
  const date = input.completedAt ?? new Date();

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Background
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, H, "F");

  // Orange frame
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(3);
  doc.rect(28, 28, W - 56, H - 56);
  doc.setLineWidth(0.75);
  doc.rect(38, 38, W - 76, H - 76);

  // Brand mark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("VERBO", W / 2, 88, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ORANGE);
  doc.text("LANGUAGE SOLUTIONS", W / 2, 104, { align: "center", charSpace: 3 });

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...WHITE);
  doc.text("CERTIFICATE OF COMPLETION", W / 2, 160, { align: "center", charSpace: 2 });

  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(2);
  doc.line(W / 2 - 70, 176, W / 2 + 70, 176);

  // Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...MUTED);
  doc.text("This certifies that", W / 2, 212, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(...WHITE);
  doc.text(studentName, W / 2, 258, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...MUTED);
  doc.text("has successfully completed the level", W / 2, 292, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...ORANGE);
  doc.text(levelName, W / 2, 330, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text(`${productDisplayName(product)} Program`, W / 2, 356, { align: "center" });

  // Footer
  const dateLabel = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.75);
  doc.line(W / 2 - 110, H - 96, W / 2 + 110, H - 96);
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(dateLabel, W / 2, H - 78, { align: "center" });
  doc.setFontSize(9);
  doc.text("verbolanguagesolutions.com", W / 2, H - 58, { align: "center" });

  doc.save(certificateFileName(input));
}
