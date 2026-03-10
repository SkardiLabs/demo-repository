Generate Skardi ctx.yaml data source entries and pipeline YAML files from a feature/API specification.

## Your task

The user will provide a feature spec (in `$ARGUMENTS` or the conversation). Read it carefully, then:

1. **Identify the data sources** needed (MySQL tables, MongoDB collections, Lance datasets, CSV files, etc.)
2. **Generate ctx.yaml entries** for each data source
3. **Identify the pipelines/endpoints** needed (one pipeline = one REST endpoint)
4. **Generate pipeline YAML files** for each endpoint

---

## Skardi file formats

### ctx.yaml — data source configuration

```yaml
data_sources:
  - name: "logical_table_name"      # referenced in SQL queries
    type: "mysql"                    # mysql | mongodb | postgres | lance | csv | parquet
    access_mode: "read_write"        # read_only | read_write (default read_only)
    connection_string: "mysql://localhost:3306/dbname"
    description: "Human-readable description"
    options:
      table: "actual_table_name"
      user_env: "MYSQL_USER"         # env var holding DB username
      pass_env: "MYSQL_PASSWORD"
      ssl_mode: "disabled"

  - name: "mongo_collection"
    type: "mongodb"
    connection_string: "mongodb://localhost:27017/dbname"
    description: "..."
    options:
      collection: "collection_name"
      user_env: "MONGO_USER"
      pass_env: "MONGO_PASS"

  - name: "vector_store"
    type: "lance"
    path: "/absolute/path/to/dataset.lance"
    description: "..."

  - name: "csv_data"
    type: "csv"
    path: "relative/path/to/file.csv"
    description: "..."
    options:
      has_header: "true"
      delimiter: ","
```

### pipeline.yaml — one file per REST endpoint

```yaml
metadata:
  name: "endpoint_name"             # becomes the URL: POST /{name}/execute
  version: "1.0"
  description: "What this endpoint does"

query: |
  SELECT col1, col2
  FROM table_name
  WHERE 1=1
    AND ({optional_param} IS NULL OR col = {optional_param})
    AND col2 = {required_param}
  LIMIT {limit}
```

**Parameter rules:**
- `{param}` — required parameter; use `({param} IS NULL OR col = {param})` to make optional
- Parameters become URL query params: `GET /endpoint/execute?param=value`
- For INSERT/UPDATE: `INSERT INTO tbl (col, ts) VALUES ({val}, NOW())`
- `k` in `lance_knn()` must be a hardcoded integer, not a `{param}`

---

## Steps to follow

1. Read `$ARGUMENTS` as the feature spec. If it's a file path, read that file.
2. Determine the output directory (ask the user if not obvious; default to creating a new subdirectory in the current project).
3. Generate a `ctx_<feature>.yaml` with all required data sources.
4. For each logical operation in the spec, create a `pipelines/<operation_name>.yaml`.
5. Write all files using the Write tool.
6. Print a summary:
   - List of data sources generated
   - List of pipelines generated with their endpoint URLs
   - Any env vars the user needs to set
   - How to start the server and register the pipelines

**Do not over-engineer.** One pipeline per distinct query/mutation. Keep SQL straightforward.
