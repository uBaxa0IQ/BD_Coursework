import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import PlayerModal from '../../components/PlayerModal'
import { useSortable } from '../../hooks/useSortable'
import { exportCsv } from '../../utils/exportCsv'
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

const METRIC_KEYS = new Set(METRICS.map(m => m.key))

export default function Leaderboard() {
  const { seasonId } = useSeasonFilter()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawMetric = searchParams.get('metric') ?? 'per'
  const metric = METRIC_KEYS.has(rawMetric) ? rawMetric : 'per'
  const setMetric = (m: string) =>
    setSearchParams(p => {
      const np = new URLSearchParams(p)
      if (m !== 'per') np.set('metric', m); else np.delete('metric')
      return np
    }, { replace: true })
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

  const { sorted, toggle, indicator } = useSortable<LeaderboardEntry>(leaders, 'value', 'desc')
  const columns: { label: string; key?: string }[] = [
    { label: '#' },
    { label: '' },
    { label: 'player', key: 'player_name' },
    { label: 'team', key: 'team_abbreviation' },
    { label: 'pos', key: 'position' },
    { label: 'gp', key: 'games_played' },
    { label: currentLabel, key: 'value' },
  ]

  const handleExport = () =>
    exportCsv(
      `leaders_${metric}_season${seasonId}.csv`,
      sorted.map((p, i) => ({
        rank: i + 1,
        player: p.player_name,
        team: p.team_abbreviation,
        pos: p.position ?? '',
        gp: p.games_played,
        [metric]: p.value,
      })),
    )

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
        <button
          className="btn btn-ghost"
          onClick={handleExport}
          style={{ marginLeft: 'auto', fontSize: 12 }}
          title="export current view to CSV"
        >
          ⤓ csv
        </button>
      </div>

      {loading ? (
        <div className="loading">loading...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(c => (
                <th
                  key={c.label}
                  onClick={c.key ? () => toggle(c.key!) : undefined}
                  style={{
                    padding: '7px 10px',
                    textAlign: c.label === '' ? 'center' : 'left',
                    fontWeight: 500,
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    cursor: c.key ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  {c.label}{c.key ? indicator(c.key) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.player_id}
                onClick={() => setSelectedPlayer(p.player_id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '7px 10px', color: 'var(--text-muted)', width: 28, fontSize: 11 }}>{i + 1}</td>
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
