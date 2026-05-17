import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { Team } from '../../types'

export default function TeamProfile() {
  const { id } = useParams<{ id: string }>()
  const { seasonId } = useSeasonFilter()
  const [team, setTeam] = useState<Team | null>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const tid = Number(id)
    Promise.all([
      teamsApi.getById(tid),
      teamsApi.getRoster(tid, seasonId),
      teamsApi.getGames(tid, seasonId),
    ]).then(([t, r, g]) => {
      setTeam(t)
      setRoster(r)
      setGames(g)
    }).finally(() => setLoading(false))
  }, [id, seasonId])

  if (loading) return <div className="loading">Загрузка...</div>
  if (!team) return <div className="error">Команда не найдена</div>

  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'
  const wins = games.filter(g => {
    const isHome = g.home_team_id === team.team_id
    return isHome ? g.home_score > g.away_score : g.away_score > g.home_score
  }).length
  const losses = games.length - wins

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img
          src={`https://cdn.nba.com/logos/nba/${team.nba_team_id}/global/L/logo.svg`}
          alt={team.name}
          style={{ width: 80, height: 80 }}
          onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        />
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>{team.name}</h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            {team.city} · {team.conference} · {team.division}
          </div>
          {team.arena_name && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{team.arena_name}</div>
          )}
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--success)' }}>{wins}W</span>
            {' - '}
            <span style={{ color: 'var(--danger)' }}>{losses}L</span>
          </div>
        </div>
      </div>

      {/* Состав */}
      {roster.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>Состав</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {['Игрок', 'Поз', 'GP', 'PTS', 'REB', 'AST', 'PER'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p: any) => (
                <tr key={p.player_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px' }}>{p.first_name} {p.last_name}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{p.games_played}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{fmt(p.avg_pts)}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{fmt(p.avg_reb)}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{fmt(p.avg_ast)}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(p.per)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
