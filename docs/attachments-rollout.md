# Private attachments MVP — manual rollout

No production migration, bucket, object, or production record was modified by this implementation.

## Architecture and boundaries

`attachments` owns an immutable, private R2 document and optional WebP thumbnail. `attachment_links` records Action / Note / stable checklist item placements. One physical document can have several placements **within the same Action**. Cross-Action sharing is intentionally unavailable. No bytes or signed URLs are stored in TipTap or Postgres; Notes contain `attachment` nodes with `attachmentId`, alignment, width percentage and caption.

Every API read/write reuses `requireTaskNoteAccess`: NextAuth session, organization, team membership, viewer role, and private/restricted Process visibility (including for org admins). Ownership of a file never bypasses the parent Action's ACL. Supabase anon/authenticated roles have no direct grants or policies on these tables. The server service role performs authorized operations. Old URLs remain bearer capabilities for at most 120 seconds after access revocation; issued URLs cannot be individually revoked. Objects are served with private/no-store caching.

The server generates a random pending key, signs PUT for exactly that key, MIME, Content-Length and 120 seconds, then verifies HEAD size, bounded GET, magic bytes and full image decoding. It writes the approved bytes to a **different final key** before marking the row ready. Replaying the upload URL can never replace a verified final file. Thumbnail keys are never exposed for writing.

## Before enabling uploads

1. Back up the Supabase schema and run the migration in a disposable/staging database first:
   `supabase/migrations/20261012120000_private_attachments.sql`.
   It adds tables, grants and validation/lifecycle triggers; it does not convert existing rows or drop columns. Review the new task scope-change guard: an Action with files cannot change organization/team until those files have been explicitly migrated/cleaned up.
2. Run that file manually in production after approval. SQL is transaction-wrapped. Do not edit previously applied migrations. `database.types.ts` was extended to the migration contract locally; it was not generated against production. Regenerate types from the approved schema using your normal Supabase workflow before a broader typed-client cutover.
3. Cloudflare Dashboard → R2 → create a dedicated **private** bucket. Disable public `r2.dev` access. Do not attach a public custom domain. Use a separate bucket/token for staging.
4. Create an R2 API token with Object Read & Write restricted to this one bucket. Record account ID, access key ID and secret access key only in Vercel server variables / local ignored `.env.local`. Never use `NEXT_PUBLIC_` for these values.
5. Configure CORS using `docs/attachments-r2-cors.json`. Replace the hostname with the exact application origin. Add staging/local origins explicitly in their own environment; never `*`. CORS controls browser behavior, not authorization. PUT uses the S3 API hostname, not a custom domain.
6. Add an R2 lifecycle rule **only for the `pending/` prefix**, expiring objects after one day. Never add blanket expiry for `files/`. A valid PUT can recreate a staging object after finalize; this rule is mandatory even with the application cleanup cron.
7. Set Vercel server environment variables:

   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - existing `NEXTAUTH_URL`, Supabase server variables and `CRON_SECRET`
   - `ATTACHMENT_SCANNER_URL` and `ATTACHMENT_SCANNER_TOKEN` to enable PDFs (see below).

8. Schedule authenticated `GET /api/cron/attachment-cleanup` at least hourly with `Authorization: Bearer <CRON_SECRET>`. Use the existing external scheduler or manually add a Vercel cron compatible with your plan. `vercel.json` is deliberately unchanged; existing reminders must continue. Never place the secret in a query string. Alert on non-2xx and on repeatedly `claimed > deleted`.
9. Deploy to a preview environment with the staging bucket/schema. Test the real browser PUT (including signed Content-Length, Chrome/Safari mobile and CORS), finalize, a PDF scan, downloads after 120 seconds, revoked memberships and cleanup. These real-service tests cannot be replaced by the local harness.
10. Enable production R2 variables only after migration and successful staging smoke tests. Without R2 variables the Action Files UI is hidden and no attachment-table list query is made.

## Image and PDF policy

PNG/JPEG/WebP: max 10 MiB and 24 million decoded pixels, no animated files. Full-size lossless WebP is chosen only if smaller than the metadata-cleaned source. Otherwise the original compressed pixel stream is retained with descriptive metadata removed. JPEG retains only EXIF orientation and ICC color information, PNG retains color/alpha chunks, WebP retains encoded pixels/color/alpha. The original document is never thumbnail-sized or aggressively recompressed. A separate ≤384 px WebP thumbnail is used in file lists. Server processing uses bounded Sharp; no browser-supplied variant is trusted. There is no general antivirus engine for images; decoder validation and metadata sanitization are the implemented controls. Keep Sharp patched.

PDF: max 25 MiB, original bytes preserved (including signatures, fonts, vectors). No PDF renderer/native PDF optimizer is installed. Preview uses the browser's PDF support in a sandboxed iframe on the isolated R2 origin, loaded only on demand; external download/open is always available. Page count/OCR is not implemented.

**PDF uploads fail closed without a scanner.** Provision a trusted HTTPS scanning endpoint yourself. The server posts raw `application/pdf` bytes with `Authorization: Bearer ATTACHMENT_SCANNER_TOKEN`, timeout 25 seconds. A successful response must be JSON `{ "verdict": "clean", "sha256": "<hash of exact received bytes>" }`. Every other response, timeout or hash mismatch denies finalize. The service must actually scan malware/active PDF content; returning `clean` unconditionally defeats this control. No scanner service has been deployed or audited in this repository. Confirm confidentiality/retention arrangements before sending private documents to a scanning vendor.

## Lifecycle and cost

- Hard limits: 1 GiB organization quota, including pending uploads and variant storage; 30 reservations/uploader/hour, 10 files/client queue, uploads processed sequentially. Database advisory locks serialize quota reservations and validated-size updates. Deleting files remain in quota until actual object deletion.
- Every successful upload is retained in the Action library as well as its requested context. Removing a Note image or deleting a checklist item removes that placement; the Action file remains available. Remove the Action-library link separately when no longer needed. Other Note placements are preserved. Checklist → Note conversion leaves files in the Action library; it does not automatically insert new Note image nodes.
- Note inline references are validated/reconciled transactionally during Note writes, including Undo/Redo. Checklist links are pruned transactionally on checklist updates; surviving/reordered IDs retain their links. Undo of a *deleted checklist item* does not automatically restore its detached file relationship; the file remains in the Action library.
- Action deletion removes links and sets file task ownership to null; no access is granted to ownerless bytes. Process deletion follows existing Action deletion/retention semantics: retained Actions retain their files and inherit the retained Action's ACL; deleted Actions are cleaned. Review the product's existing move-to-General behavior for private Processes before changing it.
- Pending/processing uploads expire after 24 hours. Unreferenced ready files get a seven-day grace period from last detach (editor undo). Canceled uploads wait at least one hour to retain abuse accounting. Cleanup locks and marks rows deleting before touching R2; new links cannot attach to deleting files. Object deletion is idempotent, and failed batches retry after a lease timeout. Do not manually delete attachment rows before R2 cleanup, because keys are the cleanup inventory.
- If the function crashes in processing, the row is not served. Retrying via UI starts a fresh upload; the stalled row expires automatically. Browser unmount cancels pending requests. If finalization won a cancellation race, the ready file stays in the Action library.
- No global checksum deduplication: it could expose cross-tenant file existence. Placement reuse uses the existing attachment ID.

## Release checks and remaining limits

Run TypeScript, lint, build, `scripts/test-attachments.ts`, `scripts/test-attachments-db.cjs`, `scripts/test-attachments-browser.cjs` and existing checklist regression scripts. The DB harness uses isolated PostgreSQL/PGlite and the API/browser harnesses use fake sessions/storage; they never validate production R2/ACL/CORS/scanning by themselves.

Local verification (2026-10-13): 55 attachment/service/security checks, 19 isolated PostgreSQL checks, 27 browser checks, and 632 existing checklist responsive/editing checks passed. Attachment screenshots cover 320/375/430/1440 px in light and dark themes. TypeScript and production build passed; ESLint reports five pre-existing hook warnings outside these changes. Read-only users can preview files without editing the document. A cancellation arriving after finalize cannot retire a ready file. The existing checklist test also reports a baseline scrolled BubbleMenu positioning limitation; verify this in the deployed ActionPanel (partial formatting itself passed).

Real R2 integration, deployed function CPU/memory, scanner, scheduler, signed Content-Length compatibility, private Process deletion semantics and multi-session concurrency must be verified in staging before calling the feature production-ready. Service timings and job failures should be monitored through existing hosting logs; signed URLs and document contents must not be logged.

Knowledge Hub continues its existing canonical text retrieval. File names/types are shown in the Action library; attachment filename search in Knowledge Hub, OCR, PDF text extraction, embeddings, versioning and AI are not implemented. UUID + checksum + MIME + timestamps and permission-bound placements are available for future indexing.

Reference constraints: [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Vercel function payload limits](https://vercel.com/docs/functions/limitations). File bytes go directly browser → R2; Vercel receives only JSON metadata, then fetches bounded bytes from R2 for verification.
