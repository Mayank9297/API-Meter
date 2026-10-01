export const nf = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)
export const tone = (s: number) => (s < 300 ? 'ok' : s < 500 ? 'warn' : 'bad')
export const ago = (t: number) => {
  const s = Math.max(1, ((Date.now() - t) / 1000) | 0)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${(s / 60) | 0}m ago` : s < 86400 ? `${(s / 3600) | 0}h ago` : `${(s / 86400) | 0}d ago`
}

/** Semicircular meter with a needle. The one memorable element of the UI. */
export function Gauge({ value, max }: { value: number; max: number }) {
  const pct = Math.min(1, max ? value / max : 0)
  const ticks = Array.from({ length: 21 }, (_, i) => {
    const a = Math.PI * (1 - i / 20), big = i % 5 === 0
    const r1 = big ? 86 : 90, r2 = 98
    return <line key={i} x1={110 + r1 * Math.cos(a)} y1={110 - r1 * Math.sin(a)} x2={110 + r2 * Math.cos(a)} y2={110 - r2 * Math.sin(a)} className={big ? 'tk big' : 'tk'} />
  })
  const arc = 'M30,110 A80,80 0 0 1 190,110'
  return (
    <svg viewBox="0 0 220 142" className="gauge" role="img" aria-label={`${Math.round(pct * 100)}% of monthly quota used`}>
      <path d={arc} pathLength={100} className="g-track" />
      <path d={arc} pathLength={100} strokeDasharray={`${pct * 100} 100`} className={pct > 0.9 ? 'g-fill hot' : 'g-fill'} />
      {ticks}
      <g style={{ transform: `rotate(${pct * 180 - 90}deg)`, transformOrigin: '110px 110px', transition: 'transform 1.1s cubic-bezier(.3,1.5,.5,1)' }}>
        <line x1="110" y1="110" x2="110" y2="42" className="needle" />
      </g>
      <circle cx="110" cy="110" r="7" className="hub" />
      <text x="110" y="136" textAnchor="middle" className="g-val">{Math.round(pct * 100)}%</text>
    </svg>
  )
}

export function Area({ data }: { data: { t: number; n: number; err: number }[] }) {
  const W = 720, H = 190
  const max = Math.max(1, ...data.map(d => d.n))
  const x = (i: number) => (data.length < 2 ? 0 : (i / (data.length - 1)) * W)
  const y = (v: number) => H - 6 - (v / max) * (H - 22)
  const line = (k: 'n' | 'err') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('')
  if (!data.length) return <div className="empty">No requests in this range yet. Send some through the gateway.</div>
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="area" role="img" aria-label="Requests over time">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb63d" stopOpacity=".38" />
          <stop offset="1" stopColor="#ffb63d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="gl" />)}
      <path d={`${line('n')}L${W},${H}L0,${H}Z`} fill="url(#fade)" />
      <path d={line('n')} className="ln" />
      <path d={line('err')} className="ln er" />
    </svg>
  )
}
