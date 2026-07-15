#!/usr/bin/env bash
# Seed the Multi-Calendar demo SQLite store with schema + fixture data.
# Usage: bash seed/seed.sh   (from multi_calendar/)
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data

sqlite3 data/calendar.db < seed/init_sqlite.sql
sqlite3 data/calendar.db < seed/seed_fixtures.sql

echo "Seeded data/calendar.db:"
sqlite3 data/calendar.db "SELECT sync_id, source, COUNT(*) FROM meetings GROUP BY 1, 2;"
