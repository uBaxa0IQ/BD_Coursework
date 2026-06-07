import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { playersApi } from '../../api/players'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { PlayerDetail, PlayerStats } from '../../types'

const P1_COLOR = '#4ade80'
const P2_COLOR = '#60a5fa'

const RADAR_MAXES = {
  avg_pts: 36,
  avg_reb: 16,
  avg_ast: 12,
  per: 36,
  bpm: 12,
  ts_pct: 0.72,
  avg_plus_minus: 12,
}

function normalize(value: number | null | undefined, max: number): number {
  if (value == null) return 0
  return Math.min(1, Math.max(0, Number(value) / max))
}

const COMPARE_METRICS: { key: keyof PlayerStats; label: string; isPct?: boolean }[] = [
  { key: 'avg_pts', label: 'PTS' },
  { key: 'avg_reb', label: 'REB' },
  { key: 'avg_ast', label: 'AST' },
  { key: 'avg_plus_minus', label: '+/-' },
  { key: 'per', label: 'PER' },
  { key: 'bpm', label: 'BPM' },
  { key: 'ts_pct', label: 'TS%', isPct: true },
  { key: 'efg_pct', label: 'eFG%', isPct: true },
  { key: 'usg_pct', label: 'USG%', isPct: true },
]

const TREND_METRICS = [
  { key: 'per', label: 'PER' },
  { key: 'avg_pts', label: 'PTS' },
  { key: 'avg_plus_minus', label: '+/-' },
  { key: 'ts_pct', label: 'TS%' },
] as const

type PlayerData = { player: PlayerDetail; career: PlayerStats[]; current: PlayerStats | null }

async function loadPlayer(id: number, seasonId: number): Promise<PlayerData> {
  const [player, career] = await Promise.all([
    playersApi.getById(id),
    playersApi.getStats(id),
  ])
  const current = career.find(s => s.season_id === seasonId) || career[career.length - 1] || null
  return { player, career, current }
}

function fmtVal(v: number | string | null | undefined, isPct?: boolean) {
  if (v == null) return '—'
  const num = Number(v)
  if (isPct) return (num * 100).toFixed(1) + '%'
  return num.toFixed(1)
}

export default function Compare() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const p1Id = Number(params.get('p1'))
  const p2Id = Number(params.get('p2'))

  const [p1, setP1] = useState<PlayerData | null>(null)
  const [p2, setP2] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState<string>('per')

  useEffect(() => {
    if (!p1Id || !p2Id) { setLoading(false); return }
    setLoading(true)
    Promise.all([loadPlayer(p1Id, seasonId), loadPlayer(p2Id, seasonId)])
      .then(([a, b]) => { setP1(a); setP2(b) })
      .finally(() => setLoading(false))
  }, [p1Id, p2Id, seasonId])

  const radarData = useMemo(() => {
    const s1 = p1?.current ?? null
    const s2 = p2?.current ?? null
    const axes: { axis: string; key: keyof typeof RADAR_MAXES }[] = [
      { axis: 'PTS', key: 'avg_pts' },
      { axis: 'REB', key: 'avg_reb' },
      { axis: 'AST', key: 'avg_ast' },
      { axis: '+/-', key: 'avg_plus_minus' },
      { axis: 'PER', key: 'per' },
      { axis: 'BPM', key: 'bpm' },
      { axis: 'TS%', key: 'ts_pct' },
    ]
    return axes.map(a => ({
      axis: a.axis,
      v1: normalize(s1?.[a.key] as number | undefined, RADAR_MAXES[a.key]),
      v2: normalize(s2?.[a.key] as number | undefined, RADAR_MAXES[a.key]),
    }))
  }, [p1, p2])

  const trendData = useMemo(() => {
    if (!p1 || !p2) return []
    const isPct = trend === 'ts_pct'
    const bySeasons = new Map<string, { season: string; v1: number | null; v2: number | null }>()
    const order: string[] = []
    const pick = (s: PlayerStats) => {
      const raw = s[trend as keyof PlayerStats]
      if (raw == null) return null
      const num = Number(raw)
      return isPct ? num * 100 : num
    }
    for (const s of p1.career) {
      if (!bySeasons.has(s.season_label)) { bySeasons.set(s.season_label, { season: s.season_label, v1: null, v2: null }); order.push(s.season_label) }
      bySeasons.get(s.season_label)!.v1 = pick(s)
    }
    for (const s of p2.career) {
      if (!bySeasons.has(s.season_label)) { bySeasons.set(s.season_label, { season: s.season_label, v1: null, v2: null }); order.push(s.season_label) }
      bySeasons.get(s.season_label)!.v2 = pick(s)
    }
    return order.sort().map(k => bySeasons.get(k)!)
  }, [p1, p2, trend])

  if (loading) return <div className="loading">Loading comparison...</div>

  if (!p1Id || !p2Id || !p1 || !p2) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ marginBottom: 12 }}>Select two players to compare.</p>
        <Link className="btn btn-primary" to="/players" style={{ fontSize: 12 }}>Go to players</Link>
      </div>
    )
  }

  const name1 = `${p1.player.first_name} ${p1.player.last_name}`
  const name2 = `${p2.player.first_name} ${p2.player.last_name}`

  const isBetter = (key: keyof PlayerStats, side: 1 | 2) => {
    const v1 = p1.current?.[key]
    const v2 = p2.current?.[key]
    if (v1 == null || v2 == null) return false
    return side === 1 ? Number(v1) > Number(v2) : Number(v2) > Number(v1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/players')}
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
      >
        ← Players
      </button>

      {/* Шапки игроков */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {[p1, p2].map((pd, i) => (
          <Link
            key={i}
            to={`/players/${pd.player.player_id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}
          >
            <img
              src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${pd.player.nba_id}.png`}
              alt=""
              style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}
              onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: i === 0 ? P1_COLOR : P2_COLOR }}>
                {pd.player.first_name} {pd.player.last_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {pd.player.team_name} · {pd.player.position || '—'}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Радар */}
      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>Profile radar (current season)</h3>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={radarData} outerRadius={120}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} />
            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
            <Radar name={name1} dataKey="v1" stroke={P1_COLOR} fill={P1_COLOR} fillOpacity={0.2} strokeWidth={2} />
            <Radar name={name2} dataKey="v2" stroke={P2_COLOR} fill={P2_COLOR} fillOpacity={0.2} strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Таблица метрик */}
      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>Season metrics</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: P1_COLOR, width: '35%' }}>{name1}</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', width: '30%' }}>metric</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: P2_COLOR, width: '35%' }}>{name2}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_METRICS.map(m => {
              const b1 = isBetter(m.key, 1)
              const b2 = isBetter(m.key, 2)
              return (
                <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: b1 ? 700 : 400, color: b1 ? P1_COLOR : 'var(--text-primary)' }}>
                    {fmtVal(p1.current?.[m.key] as number | null, m.isPct)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{m.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: b2 ? 700 : 400, color: b2 ? P2_COLOR : 'var(--text-primary)' }}>
                    {fmtVal(p2.current?.[m.key] as number | null, m.isPct)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Career-тренды */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', flex: 1 }}>Career trend</h3>
          {TREND_METRICS.map(m => (
            <button
              key={m.key}
              className={`btn ${trend === m.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTrend(m.key)}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="season" stroke="var(--text-secondary)" fontSize={11} />
            <YAxis stroke="var(--text-secondary)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} />
            <Line name={name1} type="monotone" dataKey="v1" stroke={P1_COLOR} strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line name={name2} type="monotone" dataKey="v2" stroke={P2_COLOR} strokeWidth={2} dot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
