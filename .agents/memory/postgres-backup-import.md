---
name: PostgreSQL backup import constraints
description: Safe restore behavior for the Caribo SJA local PostgreSQL installer.
---

Import full, single-database PostgreSQL backups only into a verified-empty target. Custom and tar archives can be restored with `pg_restore --single-transaction --no-owner --no-privileges`. Plain SQL should come from `pg_dump --no-owner --no-acl` without `--create` or database/role/ownership commands. Preserve the default `public` schema during restore; then run the app's migrations and do not seed demo data into the imported database.

**Why:** A full custom-format dump may omit the `public` schema definition, so dropping PostgreSQL's default empty `public` schema can make restore fail when tables are created. Restoring into a populated database can collide with existing tables and data.

**How to apply:** Before adding or changing backup-import flows, check target emptiness without deleting data, keep `public` available, restore ownership-free objects as the app role in one transaction, and make the demo-data path separate from backup import.