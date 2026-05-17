import { useEffect, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ZAxis } from 'recharts'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'

export default function Advanced() {
  const { seasonId } = useSeasonFilter()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    statsApi.getAdvanced(seasonId).then(setData).finally(() => setLoading(false))
  }, [seasonId])

  const tooltip = (props: any) => {
    const { payload } = props
    if (!payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{d.player_name}</div>
        <div style={{ color: 'var(--text-secondary)' }}>{d.team}</div>
        <div>PER: {d.per ? Number(d.per).toFixed(1) : '—'}</div>
        <div>TS%: {d.ts_pct ? (Number(d.ts_pct) * 100).toFixed(1) + '%' : '—'}</div>
        <div>USG%: {d.usg_pct ? (Number(d.usg_pct) * 100).toFixed(1) + '%' : '—'}</div>
        <div>MIN: {d.avg_min ? Number(d.avg_min).toFixed(1) : '—'}</div>
      </div>
    )
  }

  if (loading) return <div className="loading">Загрузка...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          USG% vs TS% (размер = минуты)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="usg_pct" name="USG%" stroke="var(--text-secondary)" fontSize={11}
              tickFormatter={v => (v * 100).toFixed(0) + '%'} />
            <YAxis dataKey="ts_pct" name="TS%" stroke="var(--text-secondary)" fontSize={11}
              tickFormatter={v => (v * 100).toFixed(0) + '%'} />
            <ZAxis dataKey="avg_min" range={[20, 200]} />
            <Tooltip content={tooltip} />
            <Scatter data={data} fill="var(--accent)" opacity={0.65} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          PER vs Avg MIN (выявление недооценённых игроков)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="avg_min" name="MIN" stroke="var(--text-secondary)" fontSize={11} />
            <YAxis dataKey="per" name="PER" stroke="var(--text-secondary)" fontSize={11} />
            <Tooltip content={tooltip} />
            <Scatter data={data} fill="#7c57ff" opacity={0.65} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
