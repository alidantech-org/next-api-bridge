# v0.1.8 — Compact @API logging

- Reworked pretty terminal logs around the `@API` identity so bridge traffic is distinct but fits naturally beside Next.js output.
- Preserved full endpoint paths, removed pretty request IDs, and replaced fixed-width table formatting with compact request rows.
- Added restrained method, status, path, timing, and payload colors without relying on the terminal's default foreground.
- Added compact tree rendering for request and response details, keeping simple objects with up to three keys on one line.
- Improved release CI performance by avoiding repeated Playwright system dependency installation and trimming packed E2E checks to supported boundary combinations.
- Hardened npm publishing with Trusted Publishing and public-registry verification.
