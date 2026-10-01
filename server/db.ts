import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// Serverless platforms only allow writes to /tmp (data resets on cold start).
const serverless = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
const dir = serverless ? '/tmp' : path.join(process.cwd(), 'data')
fs.mkdirSync(dir, { recursive: true })

export const db = new Database(path.join(dir, 'apimeter.db'))
db.pragma('journal_mode = WAL')
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
  prefix TEXT NOT NULL, hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL,
  rate_limit INTEGER NOT NULL, quota INTEGER NOT NULL,
  revoked_at INTEGER, last_used_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS request_logs(
  id INTEGER PRIMARY KEY, key_id INTEGER, user_id INTEGER, method TEXT NOT NULL,
  path TEXT NOT NULL, status INTEGER NOT NULL, latency_ms INTEGER NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_logs_key_ts ON request_logs(key_id, ts);
CREATE INDEX IF NOT EXISTS idx_logs_user_ts ON request_logs(user_id, ts);
`)
