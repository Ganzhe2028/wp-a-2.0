# API contracts

This directory is the compatibility boundary between backend and UI work.

- `errors.ts`: stable machine-readable error codes.
- `request-id.ts`: server-generated request ID format.
- `response.ts`: success and failure envelopes.
- Future business contracts: `home.ts`, `submission.ts`, `gallery.ts`, `artwork.ts`, and `admin.ts`.

Contract changes land before API or UI changes and must state compatibility impact. Do not export Prisma models from this directory.