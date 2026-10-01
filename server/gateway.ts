import { NextFunction, Request, Response, Router } from 'express'
import { db } from './db'
import { monthStart, sha } from './keys'

/**
 * The metered API. Pipeline per request:
 * bearer token -> key lookup (hash) -> revoked? -> rate limit (SQL, last 60s)
 * -> monthly quota (SQL) -> scope check -> handler. Every request is logged.
 */
export const gateway = Router()

gateway.use((req: Request, res: Response, next: NextFunction) => {
  const t0 = Date.now()
  let key: any = null
  res.on('finish', () => {
    db.prepare('INSERT INTO request_logs(key_id,user_id,method,path,status,latency_ms,ts) VALUES(?,?,?,?,?,?,?)')
      .run(key?.id ?? null, key?.user_id ?? null, req.method, req.path, res.statusCode, Date.now() - t0, t0)
    if (key) db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(t0, key.id)
  })
  const fail = (code: number, error: string) => res.status(code).set(code === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}).json({ error })

  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')
  if (!m) return fail(401, 'Missing bearer token. Send "Authorization: Bearer <api key>".')
  key = db.prepare('SELECT * FROM api_keys WHERE hash=?').get(sha(m[1]))
  if (!key) return fail(401, 'Invalid API key.')
  if (key.revoked_at) return fail(401, 'This API key has been revoked.')

  const used = (since: number) =>
    (db.prepare('SELECT COUNT(*) c FROM request_logs WHERE key_id=? AND ts>=? AND status<>429').get(key.id, since) as any).c as number
  const inMinute = used(t0 - 60000)
  res.set({
    'X-RateLimit-Limit': String(key.rate_limit),
    'X-RateLimit-Remaining': String(Math.max(0, key.rate_limit - inMinute - 1)),
    'X-Quota-Limit': String(key.quota)
  })
  if (inMinute >= key.rate_limit) return res.set('Retry-After', '60').status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' })
  if (used(monthStart()) >= key.quota) return fail(429, 'Monthly quota exhausted.')
  ;(req as any).key = key
  next()
})

const need = (scope: string) => (req: Request, res: Response, next: NextFunction) => {
  const s: string[] = (req as any).key.scopes.split(',')
  if (s.includes(scope) || s.includes('admin')) return next()
  res.status(403).json({ error: `This key lacks the "${scope}" scope.` })
}

gateway.get('/v1/ping', need('read'), (_q, r) => r.json({ pong: true, ts: Date.now() }))
gateway.get('/v1/time', need('read'), (_q, r) => r.json({ iso: new Date().toISOString() }))
gateway.get('/v1/users', need('read'), (_q, r) =>
  r.json({ data: ['Ada', 'Grace', 'Linus', 'Margaret', 'Dennis'].map((name, i) => ({ id: i + 1, name })) }))
gateway.post('/v1/echo', need('write'), (q, r) => r.status(201).json({ echo: q.body ?? null }))
gateway.get('/v1/reports', need('admin'), (_q, r) => r.json({ revenue: 128400, churn: 0.021, generated: new Date().toISOString() }))
gateway.use((_q, r) => r.status(404).json({ error: 'Unknown endpoint.' }))
