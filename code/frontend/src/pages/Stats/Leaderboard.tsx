import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { LeaderboardEntry } from '../../types'

const METRICS = [
  { key: 'avg_pts', label: 'PTS', formula: 'Среднее очков за матч' },
  { key: 'avg_reb', label: 'REB', formula: 'Среднее подборов за матч' },
  { key: 'avg_ast', label: 'AST', formula: 'Среднее передач за матч' },
  { key: 'avg_stl', label: 'STL', formula: 'Среднее перехватов за матч' },
  { key: 'avg_blk', label: 'BLK', formula: 'Среднее блоков за матч' },
  { key: 'per', label: 'PER', formula: 'Player Efficiency Rating (среднее по лиге = 15)' },
  { key: 'ts_pct', label: 'TS%', formula: 'TS% = PTS / (2 × (FGA + 0.44 × FTA))' },
  { key: 'efg_pct', label: 'eFG%', formula: 'eFG% = (FGM + 0.5×FG3M) / FGA' },
  { key: 'bpm', label: 'BPM', formula: 'Box Plus/Minus относительно среднего (0 = avg)' },
  { key: 'usg_pct', label: 'USG%', formula: 'Процент атак команды с участием игрока' },
]

export default function Leaderboard() {
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [metric, setMetric] = useState('per')
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    statsApi.getLeaders({ metric, season_id: seasonId, limit: 25 })
      .then(setLeaders)
      .finally(() => setLoading(false))
  }, [metric, seasonId])

  const isPct = ['ts_pct', 'efg_pct', 'usg_pct'].includes(metric)
  const fmt = (v?: number | string | null) => {
    if (v == null) return '—'
    if (isPct) return (Number(v) * 100).toFixed(1) + '%'
    return Number(v).toFixed(1)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {METRICS.map(m => (
          <div key={m.key} style={{ position: 'relative' }}>
            <button
              className={`btn ${metric === m.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMetric(m.key)}
              onMouseEnter={() => setHoveredMetric(m.key)}
              onMouseLeave={() => setHoveredMetric(null)}
            >
              {m.label}
            </button>
            {hoveredMetric === m.key && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                padding: '8px 12px', borderRadius: 6, fontSize: 12,
                color: 'var(--text-secondary)', whiteSpace: 'nowrap', zIndex: 100,
              }}>
                {m.formula}
              </div>
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {['#', '', 'Игрок', 'Команда', 'Поз', 'GP', METRICS.find(m => m.key === metric)?.label || metric].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === '' ? 'center' : 'left', fontWeight: 500, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaders.map((p) => (
              <tr
                key={p.player_id}
                onClick={() => navigate(`/players/${p.player_id}`)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.rank}</td>
                <td style={{ padding: '8px 12px', width: 44 }}>
                  <img
                    src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nba_id}.png`}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)' }}
                    onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                  />
                </td>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.player_name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.team_abbreviation}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{p.games_played}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
