type Row = {
  label: string
  value?: number | string | null
  pool: number[]
  isPct?: boolean
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function percentile(value: number, pool: number[]): number | null {
  if (!pool.length) return null
  const below = pool.filter(x => x <= value).length
  return Math.round((100 * below) / pool.length)
}

function barColor(pct: number): string {
  if (pct >= 80) return 'var(--success)'
  if (pct >= 45) return 'var(--warning)'
  return 'var(--danger)'
}

export default function PercentileBars({ rows }: { rows: Row[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => {
        const v = toNum(r.value)
        const pct = v != null ? percentile(v, r.pool) : null
        const display = v == null ? '—' : r.isPct ? (v * 100).toFixed(1) + '%' : v.toFixed(1)
        return (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 96px', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r.label}</span>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
              {pct != null && (
                <div style={{ width: `${pct}%`, height: '100%', background: barColor(pct), borderRadius: 4, transition: 'width 0.3s' }} />
              )}
            </div>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text-primary)' }}>
              {display}
              {pct != null && <span style={{ color: 'var(--text-muted)' }}>&nbsp;· {pct}p</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
