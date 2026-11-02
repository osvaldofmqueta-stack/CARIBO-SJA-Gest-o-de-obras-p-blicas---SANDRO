---
name: Imported artifact registration
description: Imported artifact files may exist before their metadata and managed workflows appear in the runtime.
---

An imported workspace can contain valid artifact manifests while both artifact and workflow listings are empty. Reconcile the existing manifests through the validated replacement callback rather than scaffolding new applications or creating replacement workflows.

**Why:** Importing this project preserved the artifact files but initially left the runtime listings empty; validating the existing manifests registered their artifacts and managed services without changing the project structure.

**How to apply:** Compare runtime listings with the manifests on disk. Preserve artifact identities, use the artifact skill's validated temp-file replacement flow, then start the exact managed service names. Do not interpret empty runtime listings as evidence that the source application is missing.
