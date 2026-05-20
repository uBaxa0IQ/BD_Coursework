import { useEffect, useState, useCallback } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import { playersApi } from '../../api/players'
import { useCompare } from '../../context/CompareContext'
import type { PlayerDetail, PlayerStats, GameLog } from '../../types'

interface Props {
  playerId: number
  seasonId: number
  onClose: () => void
}

// Hardcoded league-wide maxes for radar normalization
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

export default function PlayerModal({ playerId, seasonId, onClose }: Props) {
  const [player, setPlayer] = useState<PlayerDetail | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [gamelog, setGamelog] = useState<GameLog[]>([])
  const [loading, setLoading] = useState(true)
  const { addToCompare, removeFromCompare, isInCompare } = useCompare()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, statsRes, glRes] = await Promise.allSettled([
        playersApi.getById(playerId),
        playersApi.getStats(playerId),
        playersApi.getGamelog(playerId, seasonId),
      ])
      if (pRes.status === 'fulfilled') {
        setPlayer(pRes.value)
      } else {
        setPlayer(null)
      }
      if (statsRes.status === 'fulfilled') {
        const allStats = statsRes.value
        const current = allStats.find((s: PlayerStats) => s.season_id === seasonId)
          || allStats[allStats.length - 1]
          || null
        setStats(current)
      } else {
        setStats(null)
      }
      setGamelog(glRes.status === 'fulfilled' ? glRes.value : [])
    } finally {
      setLoading(false)
    }
  }, [playerId, seasonId])

  useEffect(() => { fetchData() }, [fetchData])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'
  const fmtPct = (v?: number | string | null) => v != null ? (Number(v) * 100).toFixed(1) + '%' : '—'

  const inCompare = isInCompare(playerId)

  const handleCompareToggle = () => {
    if (inCompare) {
      removeFromCompare(playerId)
    } else if (player) {
      addToCompare({
        player_id: playerId,
        nba_id: player.nba_id,
        name: `${player.first_name} ${player.last_name}`,
      })
    }
  }

  const radarData = stats ? [
    { axis: 'PTS', value: normalize(stats.avg_pts, RADAR_MAXES.avg_pts) },
    { axis: 'REB', value: normalize(stats.avg_reb, RADAR_MAXES.avg_reb) },
    { axis: 'AST', value: normalize(stats.avg_ast, RADAR_MAXES.avg_ast) },
    { axis: 'PER', value: normalize(stats.per, RADAR_MAXES.per) },
    { axis: 'BPM', value: normalize(stats.bpm, RADAR_MAXES.bpm) },
    { axis: 'TS%', value: normalize(stats.ts_pct, RADAR_MAXES.ts_pct) },
  ] : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: '100%', maxWidth: 700 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>player profile</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="loading">loading...</div>
        ) : !player ? (
          <div className="error" style={{ margin: 20 }}>player not found</div>
        ) : (
          <div style={{ padding: '20px' }}>
            {/* Player header */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start' }}>
              <img
                src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.nba_id}.png`}
                alt={player.first_name}
                style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}
                onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {player.nba_team_id && (
                    <img
                      src={`https://cdn.nba.com/logos/nba/${player.nba_team_id}/global/L/logo.svg`}
                      alt=""
                      style={{ width: 32, height: 32 }}
                      onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {player.first_name} {player.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {player.team_name} · {player.position || '—'} · #{player.jersey_number ?? '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                  {player.height_cm && <span>{player.height_cm} cm</span>}
                  {player.weight_kg && <span>{player.weight_kg} kg</span>}
                  {player.birth_date && <span>b. {player.birth_date}</span>}
                </div>
              </div>
              <button
                className={`btn ${inCompare ? 'btn-ghost' : 'btn-ghost'}`}
                style={{
                  fontSize: 11,
                  padding: '5px 10px',
                  borderColor: inCompare ? 'var(--accent)' : 'var(--border)',
                  color: inCompare ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onClick={handleCompareToggle}
              >
                {inCompare ? '− compare' : '+ compare'}
              </button>
            </div>

            {/* Metric badges row 1 */}
            {stats && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: 6 }}>
                  {[
                    { label: 'PTS', value: fmt(stats.avg_pts) },
                    { label: 'REB', value: fmt(stats.avg_reb) },
                    { label: 'AST', value: fmt(stats.avg_ast) },
                    { label: 'STL', value: fmt(stats.avg_stl) },
                    { label: 'BLK', value: fmt(stats.avg_blk) },
                    { label: 'FG%', value: fmtPct(stats.fg_pct) },
                    { label: '3P%', value: fmtPct(stats.fg3_pct) },
                    { label: 'FT%', value: fmtPct(stats.ft_pct) },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 4px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Metric badges row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 20 }}>
                  {[
                    { label: 'PER', value: fmt(stats.per) },
                    { label: 'TS%', value: fmtPct(stats.ts_pct) },
                    { label: 'eFG%', value: fmtPct(stats.efg_pct) },
                    { label: 'USG%', value: fmtPct(stats.usg_pct) },
                    { label: 'BPM', value: fmt(stats.bpm) },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 4px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Radar chart */}
            {radarData.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>characteristics</div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData} outerRadius={80}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    />
                    <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                    <Radar
                      dataKey="value"
                      stroke="var(--accent)"
                      fill="var(--accent)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                      formatter={(v: number) => [(v * 100).toFixed(0) + '%', 'normalized']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Game log */}
            {gamelog.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>game log</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['date', 'opp', 'min', 'pts', 'reb', 'ast', 'fg', '3p', 'ft', '+/-'].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gamelog.slice(0, 20).map(g => (
                        <tr key={g.game_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{g.game_date}</td>
                          <td style={{ padding: '5px 8px' }}>{g.opponent}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{g.minutes_played ? Number(g.minutes_played).toFixed(0) : '—'}</td>
                          <td style={{ padding: '5px 8px', fontWeight: 600 }}>{g.points}</td>
                          <td style={{ padding: '5px 8px' }}>{g.rebounds}</td>
                          <td style={{ padding: '5px 8px' }}>{g.assists}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{g.fgm}/{g.fga}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{g.fg3m}/{g.fg3a}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{g.ftm}/{g.fta}</td>
                          <td style={{ padding: '5px 8px', color: (g.plus_minus ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {g.plus_minus != null ? (g.plus_minus >= 0 ? '+' : '') + g.plus_minus : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
