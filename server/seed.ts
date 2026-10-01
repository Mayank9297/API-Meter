import bcrypt from 'bcryptjs'
import { db } from './db'
import { newKey, simulate } from './keys'

export const DEMO_EMAIL = 'demo@apimeter.dev'
export const DEMO_PASSWORD = 'demo1234'
export const DEMO_KEY = 'am_live_demo_key_for_the_request_lab'

export function seedIfEmpty() {
  if (process.env.SEED_DEMO === 'false') return
  if ((db.prepare('SELECT COUNT(*) c FROM users').get() as any).c) return
  const now = Date.now()
  const u = db.prepare('INSERT INTO users(email,name,password_hash,created_at) VALUES(?,?,?,?)')
    .run(DEMO_EMAIL, 'Demo Team', bcrypt.hashSync(DEMO_PASSWORD, 10), now)
  const uid = Number(u.lastInsertRowid)
  const ins = db.prepare('INSERT INTO api_keys(user_id,name,prefix,hash,scopes,rate_limit,quota,revoked_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  const mk = (name: string, scopes: string, rate: number, quota: number, secret?: string, revoked?: number) => {
    const k = newKey(secret)
    ins.run(uid, name, k.prefix, k.hash, scopes, rate, quota, revoked ?? null, now - 6 * 864e5)
  }
  mk('Production backend', 'read,write', 600, 50000, DEMO_KEY)
  mk('Mobile app', 'read', 120, 20000)
  mk('Admin CLI', 'read,write,admin', 60, 5000)
  mk('Old webhook worker', 'read', 30, 1000, undefined, now - 864e5)
  simulate(uid, 2400, 7 * 864e5)
}
