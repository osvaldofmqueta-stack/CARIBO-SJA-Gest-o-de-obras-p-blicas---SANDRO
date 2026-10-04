---
name: Native authentication constraints
description: Product requirements for replacing provider authentication in the Caribo SJA public-works app.
---

The Caribo SJA app uses individual email/password accounts, not shared credentials or public signup. Preserve the gestor, fiscal, and consulta roles, existing access profiles, legacy account identifiers, and historic audit attribution during authentication changes. Existing passwords are not portable. When automating initial gestor setup from Replit's shell, use protected environment-variable input rather than piping into `getpass()`; the shell has no controlling TTY and that prompt can hang. Remove temporary password secrets manually in the Secrets UI after use.

**Why:** The user chose individual accounts and required access and audit continuity while removing Clerk; the shell's non-interactive behavior and persistent Secrets require a safe bootstrap and cleanup path.

**How to apply:** Any future authentication change must retain profile and audit history, avoid resetting access without approval, and keep manager-created accounts and the terminal bootstrap command as the provisioning paths. For automated bootstrap, keep passwords out of arguments and logs, then delete temporary Secrets through the UI.