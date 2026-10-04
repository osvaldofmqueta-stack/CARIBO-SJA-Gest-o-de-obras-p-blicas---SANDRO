---
name: pnpm workspace installs
description: Package installation behavior when adding a dependency to a specific workspace package.
---

Use a workspace filter when changing dependencies for one artifact: `pnpm --filter <workspace-name> add <package>`. Root-level operations can fail with `ERR_PNPM_ADDING_TO_ROOT`, and a package-management callback may report success without changing a nested artifact's manifest or lockfile importer.

**Why:** This repository is a pnpm monorepo, and workspace-level helpers do not always target the artifact package that owns the dependency.

**How to apply:** Identify the owning package from its `package.json`, use a scoped operation when supported, then verify both that manifest and the root lockfile rather than trusting a success response.