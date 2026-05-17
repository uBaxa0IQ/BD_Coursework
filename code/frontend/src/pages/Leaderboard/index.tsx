import { useEffect, useState } from 'react'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import PlayerModal from '../../components/PlayerModal'
import type { LeaderboardEntry } from '../../types'

const METRICS = [
  { key: 'avg_pts', label: 'pts' },
  { key: 'avg_reb', label: 'reb' },
  { key: 'avg_ast', label: 'ast' },
  { key: 'avg_stl', label: 'stl' },
  { key: 'avg_blk', label: 'blk' },
  { key: 'per', label: 'per' },
  { key: 'ts_pct', label: 'ts%' },
  { key: 'efg_pct', label: 'efg%' },
  { key: 'bpm', label: 'bpm' },
  { key: 'usg_pct', label: 'usg%' },
]

const PCT_METRICS = new Set(['ts_pct', 'efg_pct', 'usg_pct'])

export default function Leaderboard() {
  const { seasonId } = useSeasonFilter()
  const [metric, setMetric] = useState('per')
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    statsApi.getLeaders({ metric, season_id: seasonId, limit: 25 })
      .then(setLeaders)
      .finally(() => setLoading(false))
  }, [metric, seasonId])

  const fmt = (v?: number | string | null) => {
    if (v == null) return '—'
    return PCT_METRICS.has(metric)
      ? (Number(v) * 100).toFixed(1) + '%'
      : Number(v).toFixed(1)
  }

  const currentLabel = METRICS.find(m => m.key === metric)?.label || metric

  return (
    <div>
      {/* Metric selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {METRICS.map(m => (
          <button
            key={m.key}
            className={`btn ${metric === m.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">loading...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', '', 'player', 'team', 'pos', 'gp', currentLabel].map(h => (
                <th key={h} style={{
                  padding: '7px 10px',
                  textAlign: h === '' ? 'center' : 'left',
                  fontWeight: 500,
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaders.map(p => (
              <tr
                key={p.player_id}
                onClick={() => setSelectedPlayer(p.player_id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '7px 10px', color: 'var(--text-muted)', width: 28, fontSize: 11 }}>{p.rank}</td>
                <td style={{ padding: '7px 10px', width: 40 }}>
                  <img
                    src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nba_id}.png`}
                    alt=""
                    style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)', display: 'block' }}
                    onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                  />
                </td>
                <td style={{ padding: '7px 10px', fontWeight: 500 }}>{p.player_name}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.team_abbreviation}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.games_played}</td>
                <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>
                  {fmt(p.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedPlayer != null && (
        <PlayerModal
          playerId={selectedPlayer}
          seasonId={seasonId}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
