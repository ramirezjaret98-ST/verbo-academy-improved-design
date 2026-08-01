// Text-only contact links used by the site footer.
// Mirrors the channels of the Contact VERBOT modal; the WhatsApp entry uses the
// dedicated footer wa.link.
export interface FooterLink {
  label: string;
  href: string;
}

export const FOOTER_CONTACT_LINKS: FooterLink[] = [
  { label: "WhatsApp", href: "https://wa.link/p2s15z" },
  { label: "Instagram", href: "https://www.instagram.com/verbo_language_solutions" },
  { label: "Facebook", href: "https://www.facebook.com/people/Verbo-Language-Solutions/61576604487318/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/verbo-language-solutions/" },
];

export const OFFICIAL_SITE_URL = "https://verbolanguagesolutions.com/";
