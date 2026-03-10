Verify a Skardi SQL query or pipeline using the local CLI.

## Your task

Use the Skardi CLI (`cargo run --bin skardi`) to validate a query against a context file.
The CLI supports **local CSV and Parquet sources only** — it cannot connect to MySQL/MongoDB/etc.

`$ARGUMENTS` can be:
- A SQL string to run: `"SELECT * FROM products LIMIT 5"`
- A path to a pipeline YAML: `pipelines/pipeline.yaml`
- A path to a ctx YAML (uses default query from context, or prompts for one)
- Blank — ask the user what they want to verify

---

## CLI reference

```bash
# Run a SQL query against a ctx
cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi -- query --ctx <ctx.yaml> --sql "SELECT ..."

# Run query from a .sql file
cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi -- query --ctx <ctx.yaml> --file query.sql

# Show schema for all tables in ctx (CSV/Parquet only)
cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi -- query --ctx <ctx.yaml> --schema --all

# Show schema for a specific table
cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi -- query --ctx <ctx.yaml> --schema -t <table_name>
```

Run from any directory — `--manifest-path` points to the skardi Cargo workspace.

---

## Steps to follow

1. Parse `$ARGUMENTS`:
   - If it looks like a SQL string → use `--sql`
   - If it's a `.yaml` path → read the pipeline file, extract the `query` field; replace `{param}` placeholders with representative test values; write to a temp `.sql` file; run with `--file`
   - If blank → ask the user for the ctx file and query

2. Determine the ctx file to use:
   - Check if there's an obvious ctx for the given pipeline (same directory pattern)
   - Otherwise ask the user

3. For pipeline YAML verification:
   - Read the pipeline file to extract the query
   - Note any `{param}` placeholders and substitute sensible test values (NULL-safe params can be left as `NULL`)
   - If the query touches MySQL/MongoDB/Lance tables, warn the user that the CLI can only verify CSV/Parquet locally; offer to use `/skardi-live` instead

4. Run the CLI command via Bash tool

5. Report results:
   - On success: show the output (schema or query results)
   - On error: show the error message and suggest fixes (wrong table name, bad SQL syntax, missing ctx, etc.)

**Tip:** For pipelines with optional params like `({x} IS NULL OR col = {x})`, substitute `NULL` for `{x}` in test runs so the filter is skipped.
