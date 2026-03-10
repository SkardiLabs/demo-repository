Start the Skardi server, register pipelines, and verify endpoints live.

## Your task

Start a live Skardi server instance, register pipelines from a given ctx + pipeline directory, then test each endpoint.

`$ARGUMENTS` can be:
- A ctx YAML path: `ctx_expense.yaml`
- A directory containing a ctx file and pipelines subdir
- Blank — ask the user which ctx and pipeline directory to use

---

## Key facts

- **Port:** Always use **8081** (OrbStack occupies 8080)
- **Skardi repo:** `../tmp/skardi`
- **Required env vars** (set based on ctx sources):
  - MySQL: `MYSQL_USER`, `MYSQL_PASSWORD`
  - MongoDB: `MONGO_USER`, `MONGO_PASS`
- **Cargo run prefix:** `MYSQL_USER=skardi MYSQL_PASSWORD=skardi123 MONGO_USER=root MONGO_PASS=rootpass cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi-server --`

## Server & pipeline commands

```bash
# Start server (run in background)
MYSQL_USER=skardi MYSQL_PASSWORD=skardi123 MONGO_USER=root MONGO_PASS=rootpass \
  cargo run --manifest-path ../tmp/skardi/Cargo.toml --bin skardi-server -- \
  --ctx <abs_path_to_ctx.yaml> --port 8081

# Register a pipeline
curl -s -X POST http://localhost:8081/register_pipeline \
  -H "Content-Type: application/json" \
  -d '{"path": "<absolute_path_to_pipeline.yaml>"}'

# Execute a pipeline (GET with query params)
curl -s "http://localhost:8081/<pipeline_name>/execute?param=value"

# Execute a pipeline (POST with JSON body)
curl -s -X POST http://localhost:8081/<pipeline_name>/execute \
  -H "Content-Type: application/json" \
  -d '{"param": "value"}'
```

---

## Steps to follow

1. Parse `$ARGUMENTS` to determine the ctx file. If a directory is given, look for `ctx_*.yaml` in it.

2. **Check if a server is already running on port 8081:**
   ```bash
   lsof -ti:8081
   ```
   If yes, ask the user whether to kill it and restart, or reuse it.

3. **Start the server in the background** using `run_in_background: true`.
   - Use absolute paths for `--ctx`
   - Wait for it to be ready by polling:
     ```bash
     curl -s http://localhost:8081/health || curl -s http://localhost:8081/
     ```
   - Give it up to ~10s (try a few times with brief pauses)

4. **Find pipeline YAML files** — look in the same directory as the ctx, or a `pipelines/` subdirectory next to it.

5. **Register each pipeline** using `POST /register_pipeline` with the absolute path.
   - Report success/failure for each.

6. **Test each registered pipeline:**
   - Read each pipeline YAML to understand its query and `{param}` placeholders
   - For SELECT pipelines: run with NULL or default test values (e.g., `?limit=5`)
   - For INSERT/UPDATE/DELETE pipelines: skip live execution by default unless the user confirms; just report the endpoint URL
   - Show the HTTP response for each tested endpoint

7. **Summarize results:**
   - Which pipelines registered successfully
   - Which endpoint tests passed / failed
   - Any errors with suggested fixes (e.g., missing env vars, Docker not running, wrong connection string)

**Common issues and fixes:**
- `Connection refused` on MySQL/MongoDB → run `docker compose up -d`
- `assert_eq!(arrays.len()...)` panic → likely the MongoExecPlan bug (check MEMORY.md)
- `timestamp` columns → must supply `NOW()` explicitly in INSERT queries
- `k` in lance_knn → must be a hardcoded integer, not a `{param}`
