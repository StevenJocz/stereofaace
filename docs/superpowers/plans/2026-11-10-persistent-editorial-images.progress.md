# SDD ledger — plan: docs/superpowers/plans/2026-11-10-persistent-editorial-images.md

Baseline: `npm test` → 7 files passed, 97 tests passed (2026-11-10).

Pre-flight: Task 1 produces `createUploadedMedia` and `getPublicMedia`; Task 2 consumes both; Task 3 consumes public local media URLs; Task 4 consumes Task 2 response; Task 5 consumes the named volume. Ruling: the source folder is not a Git repository, so no isolated worktree or task commits are possible; changes will remain in the existing project copy and be verified per task.

Task 1–4: complete in the project copy. Uploads validate MIME plus magic bytes (JPEG, PNG, WebP, AVIF), cap size at 10 MiB, store with a UUID key, require alt/credit/license, audit the uploader, and are available to article cover and body-image controls. Ruling: a stored image is linked through the existing `coverUrl` field so that legacy external URLs continue working and the public image, Open Graph and JSON-LD paths all use the same canonical URL.

Task 5: prepared in the project copy. `stereoface_media` is mounted at `/data/media`, and the image creates that directory owned by the unprivileged app user before the named volume is initialized. `DEPLOY.md` documents persistence and its smoke check. Local Docker Compose validation could not run because Docker is unavailable on this workstation.

Verification: `npx tsc --noEmit --incremental false` passed; `npm test` passed (8 files, 101 tests); `npm run lint` passed; `npm run build` passed. The build has expected log warnings for database-backed route checks because this workstation has no production `DATABASE_URL`.
