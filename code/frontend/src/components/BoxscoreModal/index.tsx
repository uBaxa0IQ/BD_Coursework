import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { statsApi } from '../../api/stats'
import { teamsApi } from '../../api/teams'
import type { Team } from '../../types'

interface Props {
  gameId: number
  onClose: () => void
}

interface BoxRow {
  player_id: number
  player_name: string
  minutes_played?: string | null
  points: number
  rebounds_off: number
  rebounds_def: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  plus_minus?: number | null
  is_starter?: boolean
}

interface Boxscore {
  game: {
    game_id: number
    home_team_id: number
    away_team_id: number
    game_date: string
    home_score?: number | null
    away_score?: number | null
    overtime?: number
  }
  home_team_stats: BoxRow[]
  away_team_stats: BoxRow[]
}

const COLS = ['min', 'pts', 'reb', 'ast', 'stl', 'blk', 'fg', '3p', 'ft', '+/-']

function StatTable({ rows, abbr }: { rows: BoxRow[]; abbr?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{abbr ?? 'Team'}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500, fontSize: 10 }}>player</th>
              {COLS.map(h => (
                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500, fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.player_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 8px', fontWeight: r.is_starter ? 600 : 400 }}>
                  {r.player_name}{r.is_starter ? ' *' : ''}
                </td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.minutes_played ? Number(r.minutes_played).toFixed(0) : '—'}</td>
                <td style={{ padding: '5px 8px', fontWeight: 600 }}>{r.points}</td>
                <td style={{ padding: '5px 8px' }}>{r.rebounds_off + r.rebounds_def}</td>
                <td style={{ padding: '5px 8px' }}>{r.assists}</td>
                <td style={{ padding: '5px 8px' }}>{r.steals}</td>
                <td style={{ padding: '5px 8px' }}>{r.blocks}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.fgm}/{r.fga}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.fg3m}/{r.fg3a}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.ftm}/{r.fta}</td>
                <td style={{ padding: '5px 8px', color: (r.plus_minus ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {r.plus_minus != null ? (r.plus_minus >= 0 ? '+' : '') + r.plus_minus : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function BoxscoreModal({ gameId, onClose }: Props) {
  const navigate = useNavigate()
  const [box, setBox] = useState<Boxscore | null>(null)
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, ts] = await Promise.allSettled([
        statsApi.getBoxscore(gameId),
        teamsApi.getList(),
      ])
      setBox(b.status === 'fulfilled' ? (b.value as Boxscore) : null)
      if (ts.status === 'fulfilled') {
        const map: Record<number, Team> = {}
        for (const t of ts.value) map[t.team_id] = t
        setTeams(map)
      }
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const home = box ? teams[box.game.home_team_id] : undefined
  const away = box ? teams[box.game.away_team_id] : undefined

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: '100%', maxWidth: 820 }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>box score</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="btn btn-ghost"
              onClick={() => { onClose(); navigate(`/games/${gameId}`) }}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              full analysis ↗
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {loading ? (
          <div className="loading">loading...</div>
        ) : !box ? (
          <div className="error" style={{ margin: 20 }}>box score not found</div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {away?.abbreviation ?? 'AWY'} {box.game.away_score ?? '—'} : {box.game.home_score ?? '—'} {home?.abbreviation ?? 'HOM'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {box.game.game_date}{(box.game.overtime ?? 0) > 0 ? ` · OT${box.game.overtime}` : ''}
              </div>
            </div>
            <StatTable rows={box.away_team_stats} abbr={away?.name ?? 'Away'} />
            <StatTable rows={box.home_team_stats} abbr={home?.name ?? 'Home'} />
          </div>
        )}
      </div>
    </div>
  )
}
