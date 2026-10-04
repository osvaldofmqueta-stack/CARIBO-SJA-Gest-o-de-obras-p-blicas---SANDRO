#!/bin/bash
set -e
pnpm install --frozen-lockfile
python artifacts/api-server/manage.py check
python artifacts/api-server/manage.py migrate --noinput
