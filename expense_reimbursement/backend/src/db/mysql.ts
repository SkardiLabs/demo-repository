import mysql from 'mysql2/promise'

// ── MySQL connection pool ─────────────────────────────────────────────────
// Same env vars used by the Skardi server for parity.

let pool: mysql.Pool | null = null

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? 'localhost',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'skardi',
      password: process.env.MYSQL_PASSWORD ?? 'skardi123',
      database: process.env.MYSQL_DATABASE ?? 'expense_db',
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true,
    })
  }
  return pool
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(sql, params)
  return rows as unknown as T[]
}

export async function execute(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().execute<mysql.ResultSetHeader>(sql, params)
  return result
}
