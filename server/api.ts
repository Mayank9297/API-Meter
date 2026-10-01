import { NextFunction, Request, Response, Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from './db'
import { monthStart, newKey, simulate } from './keys'

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'
export const api = Router()
const sign = (u: any) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' })
const pub = (u: any) => ({ id: u.id, email: u.email, name: u.name })

api.get('/health', (_q, r) => r.json({ ok: true }))

api.post('/auth/register', (req, res) => {
  const { email, password, name } = req.body || {}
  if (!/^\S+@\S+\.\S+$/.test(String(email || '')) || String(password || '').length < 8)
    return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' })
  const e = String(email).toLowerCase()
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(e)) return res.status(409).json({ error: 'That email is already registered.' })
  const info = db.prepare('INSERT INTO users(email,name,password_hash,created_at) VALUES(?,?,?,?)')
    .run(e, String(name || e.split('@')[0]).slice(0, 60), bcrypt.hashSync(String(password), 10), Date.now())
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)
  res.json({ token: sign(u), user: pub(u) })
})

api.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const u: any = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase())
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' })
  res.json({ token: sign(u), user: pub(u) })
})

api.use((req: Request, res: Response, next: NextFunction) => {
  try {
    ;(req as any).uid = (jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET) as any).id
    next()
  } catch {
    res.status(401).json({ error: 'Please sign in again.' })
  }
})

api.get('/me', (req: any, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.uid)
  u ? res.json(pub(u)) : res.status(401).json({ error: 'Please sign in again.' })
})

api.get('/keys', (req: any, res) => {
  const rows = db.prepare(`
    SELECT k.id,k.name,k.prefix,k.scopes,k.rate_limit,k.quota,k.revoked_at,k.created_at,k.last_used_at,
      (SELECT COUNT(*) FROM request_logs l WHERE l.key_id=k.id AND l.ts>=? AND l.status<>429) used_min,
      (SELECT COUNT(*) FROM request_logs l WHERE l.key_id=k.id AND l.ts>=? AND l.status<>429) used_month,
      (SELECT COUNT(*) FROM request_logs l WHERE l.key_id=k.id) total
    FROM api_keys k WHERE k.user_id=? ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`)
    .all(Date.now() - 60000, monthStart(), req.uid) as any[]
  res.json(rows.map(r => ({ ...r, scopes: r.scopes.split(',') })))
})

api.post('/keys', (req: any, res) => {
  const { name, scopes, rate_limit, quota } = req.body || {}
  const sc = (Array.isArray(scopes) ? scopes : []).filter((s: string) => ['read', 'write', 'admin'].includes(s))
  const rate = Math.floor(Number(rate_limit)), q = Math.floor(Number(quota))
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Give the key a name.' })
  if (!sc.length) return res.status(400).json({ error: 'Choose at least one scope.' })
  if (!(rate >= 1 && rate <= 100000) || !(q >= 1 && q <= 100000000)) return res.status(400).json({ error: 'Rate limit and quota must be positive numbers.' })
  const k = newKey()
  db.prepare('INSERT INTO api_keys(user_id,name,prefix,hash,scopes,rate_limit,quota,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(req.uid, String(name).trim().slice(0, 60), k.prefix, k.hash, sc.join(','), rate, q, Date.now())
  res.status(201).json({ secret: k.key })
})

api.delete('/keys/:id', (req: any, res) => {
  const r = db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').run(Date.now(), req.params.id, req.uid)
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Key not found.' })
})

api.get('/analytics', (req: any, res) => {
  const range = ({ '24h': [864e5, 36e5], '7d': [7 * 864e5, 6 * 36e5], '30d': [30 * 864e5, 864e5] } as any)[String(req.query.range)] || [864e5, 36e5]
  const [span, bucket] = range as number[]
  const since = Date.now() - span, uid = req.uid
  const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any
  const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[]
  const totals = one(`SELECT COUNT(*) total, COALESCE(SUM(status<400),0) ok, COALESCE(AVG(latency_ms),0) avg_latency
                      FROM request_logs WHERE user_id=? AND ts>=?`, uid, since)
  const quota = one(`SELECT COALESCE(SUM(quota),0) q FROM api_keys WHERE user_id=? AND revoked_at IS NULL`, uid).q
  const used = one(`SELECT COUNT(*) c FROM request_logs WHERE user_id=? AND ts>=? AND status<>429`, uid, monthStart()).c
  res.json({
    totals: { ...totals, active_keys: one('SELECT COUNT(*) c FROM api_keys WHERE user_id=? AND revoked_at IS NULL', uid).c },
    quota: { used, limit: quota },
    series: all(`SELECT (ts/?)*? t, COUNT(*) n, SUM(status>=400) err FROM request_logs
                 WHERE user_id=? AND ts>=? GROUP BY t ORDER BY t`, bucket, bucket, uid, since),
    endpoints: all(`SELECT method, path, COUNT(*) n, ROUND(AVG(latency_ms)) avg, SUM(status>=400) err FROM request_logs
                    WHERE user_id=? AND ts>=? GROUP BY method, path ORDER BY n DESC LIMIT 10`, uid, since),
    statuses: all(`SELECT status, COUNT(*) n FROM request_logs WHERE user_id=? AND ts>=? GROUP BY status ORDER BY n DESC`, uid, since),
    top_keys: all(`SELECT k.name, COUNT(*) n FROM request_logs l JOIN api_keys k ON k.id=l.key_id
                   WHERE l.user_id=? AND l.ts>=? GROUP BY k.id ORDER BY n DESC LIMIT 5`, uid, since)
  })
})

api.get('/logs', (req: any, res) => {
  const f = ({ '2xx': 'AND l.status BETWEEN 200 AND 299', '4xx': 'AND l.status BETWEEN 400 AND 499', '5xx': 'AND l.status>=500' } as any)[String(req.query.status)] || ''
  res.json(db.prepare(`SELECT l.id,l.method,l.path,l.status,l.latency_ms,l.ts,k.name key_name
    FROM request_logs l LEFT JOIN api_keys k ON k.id=l.key_id WHERE l.user_id=? ${f} ORDER BY l.ts DESC LIMIT 100`).all(req.uid))
})

api.post('/simulate', (req: any, res) => res.json({ added: simulate(req.uid, 150, 36e5) }))
