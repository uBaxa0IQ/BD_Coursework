import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import PlayerModal from '../../components/PlayerModal'
import type { Team } from '../../types'

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [team, setTeam] = useState<Team | null>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    const tid = Number(id)
    setLoading(true)
    Promise.all([
      teamsApi.getById(tid),
      teamsApi.getRoster(tid, seasonId),
    ]).then(([t, r]) => {
      setTeam(t)
      setRoster(r)
    }).finally(() => setLoading(false))
  }, [id, seasonId])

  if (loading) return <div className="loading">loading...</div>
  if (!team) return <div className="error">team not found</div>

  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Back link */}
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/teams')}
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
      >
        ← таблица
      </button>

      {/* Team header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img
          src={`https://cdn.nba.com/logos/nba/${team.nba_team_id}/global/L/logo.svg`}
          alt={team.name}
          style={{ width: 64, height: 64 }}
          onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{team.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {team.conference} · {team.division}
            {team.arena_name && ` · ${team.arena_name}`}
          </div>
        </div>
      </div>

      {/* Roster */}
      {roster.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>roster</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['', 'player', 'pos', 'gp', 'pts', 'reb', 'ast', 'per'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px',
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
              {roster.map((p: any) => (
                <tr
                  key={p.player_id}
                  onClick={() => setSelectedPlayer(p.player_id)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '6px 10px', width: 40 }}>
                    <img
                      src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nba_id}.png`}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)', display: 'block' }}
                      onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                    />
                  </td>
                  <td style={{ padding: '6px 10px', fontWeight: 500 }}>{p.first_name} {p.last_name}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{p.games_played ?? '—'}</td>
                  <td style={{ padding: '6px 10px' }}>{fmt(p.avg_pts)}</td>
                  <td style={{ padding: '6px 10px' }}>{fmt(p.avg_reb)}</td>
                  <td style={{ padding: '6px 10px' }}>{fmt(p.avg_ast)}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--accent)', fontWeight: 600 }}>{fmt(p.per)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
