import crypto from 'crypto'
import { db } from './db'

export const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

/** Secrets are shown once; only the SHA-256 hash and a short prefix are stored. */
export function newKey(secret?: string) {
  const key = secret || 'am_live_' + crypto.randomBytes(24).toString('base64url')
  return { key, prefix: key.slice(0, 12), hash: sha(key) }
}

export const monthStart = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export const ENDPOINTS = [
  { method: 'GET', path: '/v1/ping', scope: 'read', weight: 40 },
  { method: 'GET', path: '/v1/time', scope: 'read', weight: 20 },
  { method: 'GET', path: '/v1/users', scope: 'read', weight: 25 },
  { method: 'POST', path: '/v1/echo', scope: 'write', weight: 12 },
  { method: 'GET', path: '/v1/reports', scope: 'admin', weight: 3 }
]

/** Inserts realistic fake traffic so dashboards have something to show. */
export function simulate(uid: number, n: number, spanMs: number) {
  const keys = db.prepare('SELECT id FROM api_keys WHERE user_id=? AND revoked_at IS NULL').all(uid) as { id: number }[]
  if (!keys.length) return 0
  const ins = db.prepare('INSERT INTO request_logs(key_id,user_id,method,path,status,latency_ms,ts) VALUES(?,?,?,?,?,?,?)')
  const total = ENDPOINTS.reduce((a, e) => a + e.weight, 0)
  db.transaction(() => {
    for (let i = 0; i < n; i++) {
      let r = Math.random() * total
      const ep = ENDPOINTS.find(e => (r -= e.weight) < 0) || ENDPOINTS[0]
      const k = keys[Math.floor(Math.pow(Math.random(), 1.6) * keys.length)]
      const q = Math.random()
      const status = q < 0.88 ? (ep.method === 'POST' ? 201 : 200) : q < 0.92 ? 404 : q < 0.95 ? 429 : q < 0.97 ? 403 : q < 0.99 ? 500 : 502
      const latency = Math.round(14 + Math.random() * 70 + (ep.path === '/v1/reports' ? 180 : 0) + (status >= 500 ? 300 : 0))
      const ts = Date.now() - Math.pow(Math.random(), 1.3) * spanMs
      ins.run(k.id, uid, ep.method, ep.path, status, latency, Math.round(ts))
    }
  })()
  return n
}
