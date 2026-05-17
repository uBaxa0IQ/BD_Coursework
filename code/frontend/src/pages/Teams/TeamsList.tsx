import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { Team, Standing } from '../../types'

export default function TeamsList() {
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [teams, setTeams] = useState<Team[]>([])
  const [standings, setStandings] = useState<Record<number, Standing>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      teamsApi.getList(),
      teamsApi.getStandings(seasonId),
    ]).then(([t, s]) => {
      setTeams(t)
      const map: Record<number, Standing> = {}
      ;[...s.East, ...s.West].forEach(st => { map[st.team_id] = st })
      setStandings(map)
    }).finally(() => setLoading(false))
  }, [seasonId])

  if (loading) return <div className="loading">Загрузка...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
      {teams.map(t => {
        const s = standings[t.team_id]
        return (
          <div
            key={t.team_id}
            className="card"
            onClick={() => navigate(`/teams/${t.team_id}`)}
            style={{ cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
          >
            <img
              src={`https://cdn.nba.com/logos/nba/${t.nba_team_id}/global/L/logo.svg`}
              alt={t.name}
              style={{ width: 56, height: 56, marginBottom: 12 }}
              onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
            />
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {t.conference} · {t.division}
            </div>
            {s && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                <span style={{ color: 'var(--success)' }}>{s.wins}W</span>
                {' - '}
                <span style={{ color: 'var(--danger)' }}>{s.losses}L</span>
                {s.win_pct != null && (
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                    {(Number(s.win_pct) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
