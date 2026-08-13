// Small shared helper for turning a free-text phone number into a WhatsApp
// (wa.me) deep link. Used by the Student and Teacher admin detail modals —
// the phone field itself is purely informational (no format validation), so
// this only strips non-digit characters before building the link.
export function waLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}`;
}
