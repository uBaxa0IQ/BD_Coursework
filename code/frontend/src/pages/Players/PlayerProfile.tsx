import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { playersApi } from '../../api/players'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import MetricBadge from '../../components/MetricBadge'
import type { PlayerDetail, PlayerStats, GameLog } from '../../types'

const CAREER_METRICS = [
  { key: 'per', label: 'PER' },
  { key: 'avg_pts', label: 'PTS' },
  { key: 'ts_pct', label: 'TS%' },
  { key: 'bpm', label: 'BPM' },
]

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>()
  const { seasonId } = useSeasonFilter()
  const [player, setPlayer] = useState<PlayerDetail | null>(null)
  const [career, setCareer] = useState<PlayerStats[]>([])
  const [gamelog, setGamelog] = useState<GameLog[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [metric, setMetric] = useState('per')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const pid = Number(id)
    setLoading(true)
    Promise.all([
      playersApi.getById(pid),
      playersApi.getStats(pid),
      playersApi.getGamelog(pid, seasonId),
      playersApi.getTeams(pid),
    ]).then(([p, s, g, t]) => {
      setPlayer(p)
      setCareer(s)
      setGamelog(g)
      setTeams(t)
    }).finally(() => setLoading(false))
  }, [id, seasonId])

  if (loading) return <div className="loading">Загрузка профиля...</div>
  if (!player) return <div className="error">Игрок не найден</div>

  const currentSeason = career.find(s => s.season_id === seasonId) || career[career.length - 1]
  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'
  const fmtPct = (v?: number | string | null) => v != null ? (Number(v) * 100).toFixed(1) + '%' : '—'

  const chartData = career.map(s => ({
    season: s.season_label,
    value: metric === 'ts_pct' ? (s[metric as keyof PlayerStats] ? Number(s[metric as keyof PlayerStats]) * 100 : null) : s[metric as keyof PlayerStats],
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Шапка */}
      <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <img
          src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.nba_id}.png`}
          alt={player.first_name}
          style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}
          onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            {player.nba_team_id && (
              <img
                src={`https://cdn.nba.com/logos/nba/${player.nba_team_id}/global/L/logo.svg`}
                alt=""
                style={{ width: 40, height: 40 }}
                onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
              />
            )}
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>{player.first_name} {player.last_name}</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {player.team_name} · {player.position || '—'} · #{player.jersey_number ?? '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            {player.height_cm && <span>Рост: {player.height_cm} см</span>}
            {player.weight_kg && <span>Вес: {player.weight_kg} кг</span>}
            {player.birth_date && <span>ДР: {player.birth_date}</span>}
            {player.nationality && <span>{player.nationality}</span>}
          </div>
        </div>
      </div>

      {/* Метрики */}
      {currentSeason && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 8 }}>
            <MetricBadge label="PTS" value={currentSeason.avg_pts} />
            <MetricBadge label="REB" value={currentSeason.avg_reb} />
            <MetricBadge label="AST" value={currentSeason.avg_ast} />
            <MetricBadge label="STL" value={currentSeason.avg_stl} />
            <MetricBadge label="BLK" value={currentSeason.avg_blk} />
            <MetricBadge label="FG%" value={currentSeason.fg_pct ? Number(currentSeason.fg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="3P%" value={currentSeason.fg3_pct ? Number(currentSeason.fg3_pct) * 100 : null} suffix="%" />
            <MetricBadge label="FT%" value={currentSeason.ft_pct ? Number(currentSeason.ft_pct) * 100 : null} suffix="%" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            <MetricBadge label="PER" value={currentSeason.per} highlight />
            <MetricBadge label="TS%" value={currentSeason.ts_pct ? Number(currentSeason.ts_pct) * 100 : null} suffix="%" />
            <MetricBadge label="eFG%" value={currentSeason.efg_pct ? Number(currentSeason.efg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="USG%" value={currentSeason.usg_pct ? Number(currentSeason.usg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="BPM" value={currentSeason.bpm} />
          </div>
        </div>
      )}

      {/* Career Chart */}
      {career.length > 1 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', flex: 1 }}>Карьерная динамика</h3>
            {CAREER_METRICS.map(m => (
              <button
                key={m.key}
                className={`btn ${metric === m.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMetric(m.key)}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="season" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis stroke="var(--text-secondary)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Game Log */}
      {gamelog.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>Game Log</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {['Дата', 'Соп.', 'MIN', 'PTS', 'REB', 'AST', 'FG', '3P', 'FT', '+/-'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gamelog.slice(0, 30).map((g) => (
                  <tr key={g.game_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{g.game_date}</td>
                    <td style={{ padding: '6px 10px' }}>{g.opponent}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.minutes_played ? Number(g.minutes_played).toFixed(0) : '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{g.points}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.rebounds}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.assists}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.fgm}/{g.fga}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.fg3m}/{g.fg3a}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.ftm}/{g.fta}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: (g.plus_minus ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
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
  )
}
