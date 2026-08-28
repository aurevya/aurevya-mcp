# Riviera Nights

The body face of the printed proposal template, matching the fonts embedded
in `AWL_PROPOSAL_AC_20260805.pdf`.

## What is here

Four weights, converted from the supplied `.otf` originals to `.woff2` —
identical outlines, about a third of the size:

| File | Weight | Size |
|---|---|---|
| `RivieraNights-Light.woff2`   | 300 | 26K |
| `RivieraNights-Regular.woff2` | 400 | 25K |
| `RivieraNights-Medium.woff2`  | 500 | 27K |
| `RivieraNights-Bold.woff2`    | 700 | 27K |

The supplied family also contains **Ultralight** (250) and **Black** (900).
They are not here because nothing in the deck asks for them; convert and
declare them the same way if that changes.

## Licensing

This is a licensed font and these files are served from the portal, so it
is a **webfont** licence that applies — a desktop licence does not always
cover `@font-face` embedding. Worth confirming before the deck goes to
clients.

## Weight 600

The stylesheet asks for weight 600 in 32 places and the family has no
semibold. CSS resolves a missing weight above 500 by looking upwards first,
so those render as **Bold**. That matches the printed template, which uses
Regular and Bold with nothing in between.

If the headings come out heavier than intended, map 600 to Medium by
changing `font-weight:500` to `font-weight:500 600` on the Medium
`@font-face` block in `proposal-generator.html`.

## If you replace these files

Keep the names. Nothing else needs changing — the `@font-face` block at the
top of `proposal-generator.html` points at them, `--sans` leads with
`'Riviera Nights'`, and `deploy-to-portal.py` carries `.woff2` into the
deployed site. `tests/fonts.js` checks all of that still holds.
