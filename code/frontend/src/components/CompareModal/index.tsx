import { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from 'recharts'
import { playersApi } from '../../api/players'
import type { PlayerDetail, PlayerStats } from '../../types'

interface Props {
  p1Id: number
  p2Id: number
  seasonId: number
  onClose: () => void
}

const RADAR_MAXES = {
  avg_pts: 36,
  avg_reb: 16,
  avg_ast: 12,
  per: 36,
  bpm: 12,
  ts_pct: 0.72,
}

function normalize(value: number | null | undefined, max: number): number {
  if (value == null) return 0
  return Math.min(1, Math.max(0, Number(value) / max))
}

const COMPARE_METRICS: { key: keyof PlayerStats; label: string; isPct?: boolean }[] = [
  { key: 'avg_pts', label: 'PTS' },
  { key: 'avg_reb', label: 'REB' },
  { key: 'avg_ast', label: 'AST' },
  { key: 'per', label: 'PER' },
  { key: 'bpm', label: 'BPM' },
  { key: 'ts_pct', label: 'TS%', isPct: true },
  { key: 'efg_pct', label: 'eFG%', isPct: true },
  { key: 'usg_pct', label: 'USG%', isPct: true },
]

type PlayerData = { player: PlayerDetail; stats: PlayerStats | null }

export default function CompareModal({ p1Id, p2Id, seasonId, onClose }: Props) {
  const [p1, setP1] = useState<PlayerData | null>(null)
  const [p2, setP2] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      playersApi.getById(p1Id),
      playersApi.getStats(p1Id),
      playersApi.getById(p2Id),
      playersApi.getStats(p2Id),
    ]).then(([pl1, s1, pl2, s2]) => {
      const findStats = (arr: PlayerStats[]) =>
        arr.find(s => s.season_id === seasonId) || arr[arr.length - 1] || null
      setP1({ player: pl1, stats: findStats(s1) })
      setP2({ player: pl2, stats: findStats(s2) })
    }).finally(() => setLoading(false))
  }, [p1Id, p2Id, seasonId])

  const buildRadar = (s1: PlayerStats | null, s2: PlayerStats | null) => [
    { axis: 'PTS', v1: normalize(s1?.avg_pts, RADAR_MAXES.avg_pts), v2: normalize(s2?.avg_pts, RADAR_MAXES.avg_pts) },
    { axis: 'REB', v1: normalize(s1?.avg_reb, RADAR_MAXES.avg_reb), v2: normalize(s2?.avg_reb, RADAR_MAXES.avg_reb) },
    { axis: 'AST', v1: normalize(s1?.avg_ast, RADAR_MAXES.avg_ast), v2: normalize(s2?.avg_ast, RADAR_MAXES.avg_ast) },
    { axis: 'PER', v1: normalize(s1?.per, RADAR_MAXES.per), v2: normalize(s2?.per, RADAR_MAXES.per) },
    { axis: 'BPM', v1: normalize(s1?.bpm, RADAR_MAXES.bpm), v2: normalize(s2?.bpm, RADAR_MAXES.bpm) },
    { axis: 'TS%', v1: normalize(s1?.ts_pct, RADAR_MAXES.ts_pct), v2: normalize(s2?.ts_pct, RADAR_MAXES.ts_pct) },
  ]

  const fmtVal = (v: number | string | null | undefined, isPct?: boolean) => {
    if (v == null) return '—'
    return isPct ? (Number(v) * 100).toFixed(1) + '%' : Number(v).toFixed(1)
  }

  const isBetter = (key: keyof PlayerStats, s1: PlayerStats | null, s2: PlayerStats | null, side: 1 | 2): boolean => {
    if (!s1 || !s2) return false
    const v1 = Number(s1[key] ?? 0)
    const v2 = Number(s2[key] ?? 0)
    return side === 1 ? v1 > v2 : v2 > v1
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: '100%', maxWidth: 780 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>player comparison</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="loading">loading...</div>
        ) : (
          <div style={{ padding: '20px' }}>
            {/* Player headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {[p1, p2].map((pd, i) => pd && (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${pd.player.nba_id}.png`}
                    alt=""
                    style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}
                    onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: i === 0 ? 'var(--accent)' : 'var(--compare-color)' }}>
                      {pd.player.first_name} {pd.player.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {pd.player.team_name} · {pd.player.position || '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Combined radar */}
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={buildRadar(p1?.stats ?? null, p2?.stats ?? null)} outerRadius={88}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                />
                <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                <Radar name={p1 ? `${p1.player.first_name} ${p1.player.last_name}` : 'P1'} dataKey="v1" stroke="#4ade80" fill="#4ade80" fillOpacity={0.2} strokeWidth={2} />
                <Radar name={p2 ? `${p2.player.first_name} ${p2.player.last_name}` : 'P2'} dataKey="v2" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.2} strokeWidth={2} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
                />
              </RadarChart>
            </ResponsiveContainer>

            {/* Metrics table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 16 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)', width: '30%' }}>
                    {p1 ? `${p1.player.first_name} ${p1.player.last_name}` : '—'}
                  </th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)', width: '40%' }}>metric</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)', width: '30%' }}>
                    {p2 ? `${p2.player.first_name} ${p2.player.last_name}` : '—'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_METRICS.map(m => {
                  const v1 = p1?.stats ? p1.stats[m.key] : null
                  const v2 = p2?.stats ? p2.stats[m.key] : null
                  const b1 = isBetter(m.key, p1?.stats ?? null, p2?.stats ?? null, 1)
                  const b2 = isBetter(m.key, p1?.stats ?? null, p2?.stats ?? null, 2)
                  return (
                    <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{
                        padding: '7px 12px',
                        fontWeight: b1 ? 600 : 400,
                        color: b1 ? 'var(--accent)' : 'var(--text-primary)',
                      }}>
                        {fmtVal(v1 as number | null, m.isPct)}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>
                        {m.label}
                      </td>
                      <td style={{
                        padding: '7px 12px',
                        textAlign: 'right',
                        fontWeight: b2 ? 600 : 400,
                        color: b2 ? 'var(--accent)' : 'var(--text-primary)',
                      }}>
                        {fmtVal(v2 as number | null, m.isPct)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
