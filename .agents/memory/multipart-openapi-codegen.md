---
name: Multipart OpenAPI codegen
description: Generator constraint observed for multipart binary request bodies in this workspace's Orval and Zod client generation.
---

When an OpenAPI multipart upload exposes a binary file to generated clients, this workspace's Orval/Zod code generation can emit unsupported `File`/`Blob` references and conflicting exports. Keep local-only multipart routes out of generated contracts unless a schema shape has first been shown to codegen and typecheck cleanly. Call such endpoints through the existing authenticated request helper with `FormData`, leaving the multipart content type to the browser.

**Why:** The attempted binary upload schema failed library typechecking, while leaving the route out of the generated contract allowed the shared client and schema packages to compile.

**How to apply:** Before documenting a binary upload endpoint, run codegen and the shared-library typecheck. If generated output is incompatible, use the authenticated manual multipart request path until a compatible schema is confirmed.