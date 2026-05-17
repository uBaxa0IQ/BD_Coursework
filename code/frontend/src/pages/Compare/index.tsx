import { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { statsApi } from '../../api/stats'
import { leagueApi } from '../../api/league'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { useDebounce } from '../../hooks/useDebounce'

const RADAR_METRICS = [
  { key: 'avg_pts', label: 'PTS', max: 40 },
  { key: 'avg_reb', label: 'REB', max: 15 },
  { key: 'avg_ast', label: 'AST', max: 12 },
  { key: 'avg_stl', label: 'STL', max: 3 },
  { key: 'avg_blk', label: 'BLK', max: 3 },
  { key: 'fg_pct', label: 'FG%', max: 1 },
  { key: 'ts_pct', label: 'TS%', max: 1 },
  { key: 'per', label: 'PER', max: 35 },
]

export default function Compare() {
  const { seasonId } = useSeasonFilter()
  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  const [r1, setR1] = useState<any[]>([])
  const [r2, setR2] = useState<any[]>([])
  const [p1, setP1] = useState<any>(null)
  const [p2, setP2] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)
  const dq1 = useDebounce(q1, 300)
  const dq2 = useDebounce(q2, 300)

  useEffect(() => {
    if (dq1.length >= 2) leagueApi.search(dq1).then(r => setR1(r.players)).catch(() => {})
    else setR1([])
  }, [dq1])

  useEffect(() => {
    if (dq2.length >= 2) leagueApi.search(dq2).then(r => setR2(r.players)).catch(() => {})
    else setR2([])
  }, [dq2])

  useEffect(() => {
    if (p1 && p2) {
      statsApi.comparePlayers(p1.player_id, p2.player_id, seasonId)
        .then(setCompareData)
        .catch(() => setCompareData(null))
    }
  }, [p1, p2, seasonId])

  const radarData = compareData ? RADAR_METRICS.map(m => ({
    metric: m.label,
    p1: Math.round((Number(compareData.player1[m.key] || 0) / m.max) * 100),
    p2: Math.round((Number(compareData.player2[m.key] || 0) / m.max) * 100),
  })) : []

  const barData = compareData
    ? [
        { stat: 'PTS', p1: Number(compareData.player1.avg_pts) || 0, p2: Number(compareData.player2.avg_pts) || 0 },
        { stat: 'REB', p1: Number(compareData.player1.avg_reb) || 0, p2: Number(compareData.player2.avg_reb) || 0 },
        { stat: 'AST', p1: Number(compareData.player1.avg_ast) || 0, p2: Number(compareData.player2.avg_ast) || 0 },
        { stat: 'STL', p1: Number(compareData.player1.avg_stl) || 0, p2: Number(compareData.player2.avg_stl) || 0 },
        { stat: 'BLK', p1: Number(compareData.player1.avg_blk) || 0, p2: Number(compareData.player2.avg_blk) || 0 },
      ]
    : []

  const SearchBox = ({ q, setQ, results, onSelect, selected }: any) => (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Поиск игрока..."
        style={{
          width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', padding: '10px 14px',
          borderRadius: 'var(--radius-sm)', fontSize: 14, outline: 'none',
        }}
      />
      {selected && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={selected.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }} />
          <span style={{ fontWeight: 600 }}>{selected.full_name}</span>
          <button onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}
      {results.length > 0 && !selected && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', zIndex: 100, maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map((r: any) => (
            <div
              key={r.player_id}
              onClick={() => { onSelect(r); setQ(r.full_name); }}
              style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <img src={r.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }} />
              {r.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const StatRow = ({ label, v1, v2, isPct = false }: any) => {
    const n1 = Number(v1), n2 = Number(v2)
    const fmt = (v: number) => isPct ? (v * 100).toFixed(1) + '%' : v.toFixed(1)
    return (
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: v1 != null && n1 >= n2 ? 700 : 400, color: v1 != null && n1 >= n2 ? 'var(--success)' : 'var(--text-primary)', textAlign: 'right' }}>
          {v1 != null ? fmt(n1) : '—'}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{label}</td>
        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: v2 != null && n2 > n1 ? 700 : 400, color: v2 != null && n2 > n1 ? 'var(--success)' : 'var(--text-primary)' }}>
          {v2 != null ? fmt(n2) : '—'}
        </td>
      </tr>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <SearchBox q={q1} setQ={setQ1} results={r1} onSelect={setP1} selected={p1} />
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>VS</div>
        <SearchBox q={q2} setQ={setQ2} results={r2} onSelect={setP2} selected={p2} />
      </div>

      {compareData && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>Radar Chart</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Radar name={compareData.player1_name} dataKey="p1" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3} />
                <Radar name={compareData.player2_name} dataKey="p2" stroke="#7c57ff" fill="#7c57ff" fillOpacity={0.3} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--accent)' }}>■ {compareData.player1_name}</span>
              <span style={{ color: '#7c57ff' }}>■ {compareData.player2_name}</span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Базовая статистика (столбчатая диаграмма)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="stat" stroke="var(--text-secondary)" fontSize={12} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Legend />
                <Bar name={compareData.player1_name} dataKey="p1" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar name={compareData.player2_name} dataKey="p2" fill="#7c57ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div style={{ display: 'flex', marginBottom: 12 }}>
              <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{compareData.player1_name}</div>
              <div style={{ width: 80 }} />
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{compareData.player2_name}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <StatRow label="PTS" v1={compareData.player1.avg_pts} v2={compareData.player2.avg_pts} />
                <StatRow label="REB" v1={compareData.player1.avg_reb} v2={compareData.player2.avg_reb} />
                <StatRow label="AST" v1={compareData.player1.avg_ast} v2={compareData.player2.avg_ast} />
                <StatRow label="PER" v1={compareData.player1.per} v2={compareData.player2.per} />
                <StatRow label="TS%" v1={compareData.player1.ts_pct} v2={compareData.player2.ts_pct} isPct />
                <StatRow label="eFG%" v1={compareData.player1.efg_pct} v2={compareData.player2.efg_pct} isPct />
                <StatRow label="BPM" v1={compareData.player1.bpm} v2={compareData.player2.bpm} />
                <StatRow label="USG%" v1={compareData.player1.usg_pct} v2={compareData.player2.usg_pct} isPct />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
