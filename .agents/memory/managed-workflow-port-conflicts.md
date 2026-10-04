---
name: Managed artifact workflow port conflicts
description: Diagnose a Django artifact workflow that fails because an older process still owns its port.
---

After post-merge workflow reconciliation, an API artifact may report that its configured port is already in use while an earlier development server continues responding through the artifact proxy.

**Why:** A stale server process can outlive the workflow attempt; the app may be healthy even while the workflow status is failed.

**How to apply:** Identify the listener and verify it is this workspace's Django development server before stopping it. Then restart the exact managed artifact workflow once. Do not change ports or add a duplicate workflow until the old process is ruled out.