import { useMemo } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

type Bin = { label: string; mid: number; count: number }

const BIN_WIDTH = 5

function buildBins(values: number[]): Bin[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const lo = Math.floor(min / BIN_WIDTH) * BIN_WIDTH
  const hi = Math.ceil((max + 1) / BIN_WIDTH) * BIN_WIDTH
  const bins: Bin[] = []
  for (let start = lo; start < hi; start += BIN_WIDTH) {
    const end = start + BIN_WIDTH
    const count = values.filter(v => v >= start && v < end).length
    bins.push({ label: `${start}…${end}`, mid: start + BIN_WIDTH / 2, count })
  }
  return bins
}

function HistTooltip({ active, payload }: { active?: boolean; payload?: { payload?: Bin }[] }) {
  if (!active || !payload?.[0]?.payload) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>+/- {d.label}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{d.count} games</div>
    </div>
  )
}

export default function PlusMinusHistogram({ values }: { values: number[] }) {
  const bins = useMemo(() => buildBins(values), [values])

  const stats = useMemo(() => {
    if (!values.length) return null
    const n = values.length
    const mean = values.reduce((a, b) => a + b, 0) / n
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
    return { mean, std: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values), n }
  }, [values])

  if (!bins.length || !stats) return null

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        <span>Avg <b style={{ color: stats.mean >= 0 ? 'var(--success)' : 'var(--danger)' }}>{(stats.mean >= 0 ? '+' : '') + stats.mean.toFixed(1)}</b></span>
        <span>Spread σ {stats.std.toFixed(1)}</span>
        <span>Best {(stats.max >= 0 ? '+' : '') + stats.max}</span>
        <span>Worst {stats.min}</span>
        <span>{stats.n} games</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={48} />
          <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} width={28} />
          <Tooltip content={<HistTooltip />} cursor={{ fill: 'var(--bg-card-hover)' }} />
          <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {bins.map((b, i) => (
              <Cell key={i} fill={b.mid >= 0 ? 'var(--success)' : 'var(--danger)'} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
