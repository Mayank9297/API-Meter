import { useCallback, useEffect, useState } from 'react'
import { api, setToken, token } from './api'
import { Area, Gauge, ago, nf, tone } from './ui'

const TABS = [['overview', 'Overview'], ['keys', 'API keys'], ['endpoints', 'Endpoints'], ['logs', 'Requests'], ['lab', 'Request lab']]
const RANGES = ['24h', '7d', '30d']
const GW = {
  '/v1/ping': 'GET', '/v1/time': 'GET', '/v1/users': 'GET', '/v1/echo': 'POST', '/v1/reports': 'GET'
} as Record<string, string>

export default function App() {
  const [user, setUser] = useState<any>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!token()) return setReady(true)
    api('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true))
  }, [])
  if (!ready) return null
  return user ? <Shell user={user} out={() => { setToken(null); setUser(null) }} /> : <Auth onAuth={setUser} />
}

function Auth({ onAuth }: { onAuth: (u: any) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (body: typeof f) => {
    setBusy(true); setErr('')
    try {
      const r = await api(`/auth/${mode}`, { method: 'POST', body })
      setToken(r.token); onAuth(r.user)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <main className="auth">
      <section className="auth-hero">
        <div className="brand"><i className="dot" /> API Meter</div>
        <h1>Every call to your API, counted and kept in check.</h1>
        <p>Issue keys, set rate limits and quotas, and watch traffic as it happens.</p>
        <div className="auth-gauge"><Gauge value={68} max={100} /></div>
      </section>
      <form className="auth-card" onSubmit={e => { e.preventDefault(); go(f) }}>
        <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
        {mode === 'register' && <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>}
        <label>Email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<input type="password" required minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn" onClick={() => go({ name: '', email: 'demo@apimeter.dev', password: 'demo1234' })}>Explore the demo account</button>
        <p className="swap">{mode === 'login' ? 'New here?' : 'Have an account?'}{' '}
          <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</a></p>
      </form>
    </main>
  )
}

function Shell({ user, out }: { user: any; out: () => void }) {
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState('24h')
  const [data, setData] = useState<any>(null)
  const [keys, setKeys] = useState<any[]>([])
  const load = useCallback(() => {
    api('/analytics?range=' + range).then(setData).catch(() => {})
    api('/keys').then(setKeys).catch(() => {})
  }, [range])
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><i className="dot" /> API Meter</div>
        <nav aria-label="Sections">
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <div className="who"><span>{user.name}</span><button className="link" onClick={out}>Sign out</button></div>
      </header>
      <main className="page">
        {!data ? <p className="empty">Loading your meter…</p> : (
          <>
            {tab === 'overview' && <Overview data={data} range={range} setRange={setRange} reload={load} />}
            {tab === 'keys' && <Keys keys={keys} reload={load} />}
            {tab === 'endpoints' && <Endpoints data={data} range={range} setRange={setRange} />}
            {tab === 'logs' && <Logs />}
            {tab === 'lab' && <Lab reload={load} />}
          </>
        )}
      </main>
    </div>
  )
}

function Range({ range, setRange }: { range: string; setRange: (r: string) => void }) {
  return <div className="seg" role="group" aria-label="Time range">{RANGES.map(r => <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}</div>
}

function Overview({ data, range, setRange, reload }: any) {
  const t = data.totals, ok = t.total ? (t.ok / t.total) * 100 : 100
  const maxStatus = Math.max(1, ...data.statuses.map((s: any) => s.n))
  const [logs, setLogs] = useState<any[]>([])
  useEffect(() => { api('/logs').then(r => setLogs(r.slice(0, 7))) }, [data])
  return (
    <>
      <div className="head">
        <h1>{nf(t.total)} requests in the last {range === '24h' ? '24 hours' : range === '7d' ? '7 days' : '30 days'}</h1>
        <Range range={range} setRange={setRange} />
      </div>
      <div className="hero">
        <section className="panel meter">
          <h3>Monthly quota</h3>
          <Gauge value={data.quota.used} max={data.quota.limit} />
          <p className="sub">{nf(data.quota.used)} of {nf(data.quota.limit)} calls used across {t.active_keys} active keys</p>
        </section>
        <section className="kpis">
          <div className="kpi"><b>{ok.toFixed(1)}%</b><span>of requests succeeded</span></div>
          <div className="kpi"><b>{Math.round(t.avg_latency)} ms</b><span>average response time</span></div>
          <div className="kpi"><b>{nf(t.total - t.ok)}</b><span>requests that failed</span></div>
          <div className="kpi"><b>{t.active_keys}</b><span>active API keys</span></div>
        </section>
      </div>
      <section className="panel">
        <div className="legend"><h3>Traffic</h3><span><i className="sw amber" />Requests</span><span><i className="sw coral" />Errors</span></div>
        <Area data={data.series} />
      </section>
      <div className="cols">
        <section className="panel">
          <h3>Status codes</h3>
          {data.statuses.map((s: any) => (
            <div className="bar-row" key={s.status}>
              <span className={`code ${tone(s.status)}`}>{s.status}</span>
              <div className="bar"><i className={tone(s.status)} style={{ width: `${(s.n / maxStatus) * 100}%` }} /></div>
              <span className="num">{nf(s.n)}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="legend"><h3>Latest requests</h3>
            <button className="link" onClick={() => api('/simulate', { method: 'POST' }).then(reload)}>Add sample traffic</button></div>
          <LogTable rows={logs} compact />
        </section>
      </div>
    </>
  )
}

function Keys({ keys, reload }: { keys: any[]; reload: () => void }) {
  const [f, setF] = useState({ name: '', scopes: ['read'], rate_limit: 120, quota: 10000 })
  const [secret, setSecret] = useState('')
  const [err, setErr] = useState('')
  const toggle = (s: string) => setF({ ...f, scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s] })
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try { const r = await api('/keys', { method: 'POST', body: f }); setSecret(r.secret); setF({ ...f, name: '' }); reload() }
    catch (e: any) { setErr(e.message) }
  }
  return (
    <>
      <div className="head"><h1>API keys</h1></div>
      <form className="panel create" onSubmit={create}>
        <label>Key name<input value={f.name} placeholder="e.g. Checkout service" onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <fieldset><legend>Scopes</legend>
          {['read', 'write', 'admin'].map(s => <label key={s} className="chk"><input type="checkbox" checked={f.scopes.includes(s)} onChange={() => toggle(s)} />{s}</label>)}
        </fieldset>
        <label>Requests per minute<input type="number" min={1} value={f.rate_limit} onChange={e => setF({ ...f, rate_limit: +e.target.value })} /></label>
        <label>Monthly quota<input type="number" min={1} value={f.quota} onChange={e => setF({ ...f, quota: +e.target.value })} /></label>
        <button className="btn primary">Create key</button>
        {err && <p className="err" role="alert">{err}</p>}
      </form>
      {secret && (
        <div className="secret" role="status">
          <p>Copy your new key now. You won't be able to see it again.</p>
          <code>{secret}</code>
          <button className="btn" onClick={() => navigator.clipboard.writeText(secret)}>Copy</button>
          <button className="link" onClick={() => setSecret('')}>Dismiss</button>
        </div>
      )}
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Rate (per min)</th><th>Quota (month)</th><th>Last used</th><th /></tr></thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id} className={k.revoked_at ? 'dim' : ''}>
                <td>{k.name}</td>
                <td className="mono">{k.prefix}…</td>
                <td>{k.scopes.map((s: string) => <span key={s} className="chip">{s}</span>)}</td>
                <td><Meter used={k.used_min} max={k.rate_limit} /></td>
                <td><Meter used={k.used_month} max={k.quota} /></td>
                <td>{k.last_used_at ? ago(k.last_used_at) : 'Never'}</td>
                <td>{k.revoked_at ? <span className="chip bad">Revoked</span> :
                  <button className="link danger" onClick={() => confirm(`Revoke "${k.name}"? Apps using it will stop working.`) && api('/keys/' + k.id, { method: 'DELETE' }).then(reload)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

const Meter = ({ used, max }: { used: number; max: number }) => (
  <div className="mini"><div className="bar"><i className={used / max > 0.9 ? 'bad' : 'ok'} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} /></div><span>{nf(used)} / {nf(max)}</span></div>
)

function Endpoints({ data, range, setRange }: any) {
  const max = Math.max(1, ...data.endpoints.map((e: any) => e.n))
  return (
    <>
      <div className="head"><h1>Endpoints</h1><Range range={range} setRange={setRange} /></div>
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Endpoint</th><th>Calls</th><th /><th>Avg latency</th><th>Error rate</th></tr></thead>
          <tbody>
            {data.endpoints.map((e: any) => (
              <tr key={e.method + e.path}>
                <td className="mono"><span className={`verb ${e.method}`}>{e.method}</span> {e.path}</td>
                <td className="num">{nf(e.n)}</td>
                <td style={{ width: '30%' }}><div className="bar"><i className="amber" style={{ width: `${(e.n / max) * 100}%` }} /></div></td>
                <td className="num">{e.avg} ms</td>
                <td className={`num ${e.err / e.n > 0.1 ? 'bad-t' : ''}`}>{((e.err / e.n) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.endpoints.length && <p className="empty">No endpoint traffic in this range.</p>}
      </section>
      <section className="panel">
        <h3>Top keys by traffic</h3>
        {data.top_keys.map((k: any) => <div className="bar-row" key={k.name}><span>{k.name}</span><div className="bar"><i className="sea" style={{ width: `${(k.n / data.top_keys[0].n) * 100}%` }} /></div><span className="num">{nf(k.n)}</span></div>)}
      </section>
    </>
  )
}

function LogTable({ rows, compact }: { rows: any[]; compact?: boolean }) {
  if (!rows.length) return <p className="empty">No requests yet.</p>
  return (
    <div className="table-wrap">
      <table className={compact ? 'compact' : ''}>
        {!compact && <thead><tr><th>Status</th><th>Request</th><th>Key</th><th>Time</th><th>Latency</th></tr></thead>}
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td><span className={`code ${tone(r.status)}`}>{r.status}</span></td>
              <td className="mono"><span className={`verb ${r.method}`}>{r.method}</span> {r.path}</td>
              {!compact && <td>{r.key_name || 'Unknown key'}</td>}
              <td>{ago(r.ts)}</td>
              <td className="num">{r.latency_ms} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Logs() {
  const [status, setStatus] = useState('all')
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { api('/logs?status=' + status).then(setRows) }, [status])
  return (
    <>
      <div className="head"><h1>Requests</h1>
        <div className="seg" role="group" aria-label="Filter by status">{['all', '2xx', '4xx', '5xx'].map(s => <button key={s} className={s === status ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>)}</div></div>
      <section className="panel"><LogTable rows={rows} /></section>
    </>
  )
}

function Lab({ reload }: { reload: () => void }) {
  const [key, setKey] = useState('am_live_demo_key_for_the_request_lab')
  const [path, setPath] = useState('/v1/ping')
  const [body, setBody] = useState('{"hello":"meter"}')
  const [res, setRes] = useState<any>(null)
  const send = async () => {
    const t0 = performance.now(), method = GW[path]
    const r = await fetch('/gateway' + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: method === 'POST' ? body : undefined })
    const text = await r.text()
    setRes({ status: r.status, ms: Math.round(performance.now() - t0), limit: r.headers.get('X-RateLimit-Limit'), left: r.headers.get('X-RateLimit-Remaining'), text })
    reload()
  }
  return (
    <>
      <div className="head"><h1>Request lab</h1></div>
      <section className="panel lab">
        <p className="sub">Call the live gateway with any key. Each call is validated, limited, logged and shows up in your dashboard.</p>
        <label>API key<input className="mono" value={key} onChange={e => setKey(e.target.value)} /></label>
        <label>Endpoint<select value={path} onChange={e => setPath(e.target.value)}>{Object.entries(GW).map(([p, m]) => <option key={p} value={p}>{m} {p}</option>)}</select></label>
        {GW[path] === 'POST' && <label>JSON body<textarea className="mono" rows={3} value={body} onChange={e => setBody(e.target.value)} /></label>}
        <button className="btn primary" onClick={send}>Send request</button>
        {res && (
          <div className="resp">
            <div><span className={`code ${tone(res.status)}`}>{res.status}</span> <span className="sub">{res.ms} ms{res.limit && ` · ${res.left} of ${res.limit} requests left this minute`}</span></div>
            <pre>{res.text}</pre>
          </div>
        )}
        <pre className="curl">{`curl ${location.origin}/gateway${path} \\\n  -H "Authorization: Bearer ${key}"`}</pre>
      </section>
    </>
  )
}
