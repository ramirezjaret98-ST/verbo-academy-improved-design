## Goal

Make the artwork in the 5 benefit cards of the homepage match the reference screenshot: large cut-outs anchored to a card edge, bottom-aligned to the card floor, and clearly overflowing above the card's top edge — instead of the current small images tucked inside the padding.

## What's wrong today

In `src/routes/index.tsx`, `BenefitCard` renders the art as an in-flow flex column (`w-2/5`, `h-48`, small negative margins). That keeps the image inside the padded content row, so it stays small, vertically centered-ish, and never breaks the top edge.

## Fix

Rewrite the art layer in `BenefitCard` as an **absolutely positioned** element, so its size no longer depends on the text block:

```text
card (relative, overflow-visible, rounded-[2rem])
├── watermark layer   (absolute inset-0, overflow-hidden, clipped)
├── art               (absolute, bottom-0, left-0 or right-0, w-[52%], h-[125%])
└── text column       (relative, z-10, padded, 48% width on the free side)
```

Per-card anchoring, matching the reference:

| Card | Art anchor | Notes |
|---|---|---|
| Gold — Learn on Your Own Terms | bottom-left | text right |
| Orchid — Speak with confidence | bottom-right | text left |
| Crimson — Level Up (tall card) | bottom-right, wide | overflows bottom edge slightly |
| Lime — Track real progress | bottom-right | text left |
| Navy — Guided by Instructors | bottom-left, flush | sits inside bottom, minimal top overflow |

Technical details:
- Art: `object-contain object-bottom`, height greater than 100% of the card (`h-[128%]`) so the head breaks the top edge; no `overflow-hidden` on the card itself (already the case).
- Text column: gets an explicit width on `sm+` (`w-[48%]`) and is pushed to the side opposite the art via `ml-auto` / `mr-auto`, with `z-10` so it always sits above the artwork.
- Mobile (< sm): art returns to a stacked layout under the text at a controlled height so nothing overlaps the copy.
- Keep the existing gradients, texts, reveal animation, hover lift and the 8% white watermark icons untouched; only geometry changes.
- Enlarge/rotate the crimson card's lightning bolt watermark to the reference's scale (big diagonal bolt on the left) and the gift shape on the right.

## Verification

Screenshot the section at desktop width and compare against the reference, then check `md` and mobile widths for text/art collisions.
