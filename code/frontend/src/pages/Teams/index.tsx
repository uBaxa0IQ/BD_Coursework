import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { Standing } from '../../types'

export default function Teams() {
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [standings, setStandings] = useState<{ East: Standing[]; West: Standing[] }>({ East: [], West: [] })
  const [activeTab, setActiveTab] = useState<'East' | 'West'>('East')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    teamsApi.getStandings(seasonId).then(setStandings).finally(() => setLoading(false))
  }, [seasonId])

  if (loading) return <div className="loading">loading...</div>

  const list = standings[activeTab]
  const leader = list[0]
  const gb = (t: Standing) => {
    if (!leader) return 0
    return ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['East', 'West'] as const).map(conf => (
          <button
            key={conf}
            className={`btn ${activeTab === conf ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(conf)}
          >
            {conf === 'East' ? 'east' : 'west'}
          </button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#', '', 'team', 'w', 'l', 'w%', 'gb'].map(h => (
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
          {list.map((t, i) => (
            <tr
              key={t.team_id}
              onClick={() => navigate(`/teams/${t.team_id}`)}
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '7px 10px', color: 'var(--text-muted)', width: 30, fontSize: 11 }}>{i + 1}</td>
              <td style={{ padding: '7px 10px', width: 40 }}>
                <img
                  src={`https://cdn.nba.com/logos/nba/${t.nba_team_id}/global/L/logo.svg`}
                  alt=""
                  style={{ width: 26, height: 26, display: 'block' }}
                  onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                />
              </td>
              <td style={{ padding: '7px 10px', fontWeight: i < 8 ? 500 : 400 }}>{t.name}</td>
              <td style={{ padding: '7px 10px', color: 'var(--success)' }}>{t.wins}</td>
              <td style={{ padding: '7px 10px', color: 'var(--danger)' }}>{t.losses}</td>
              <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>
                {t.win_pct != null ? (Number(t.win_pct) * 100).toFixed(1) + '%' : '—'}
              </td>
              <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>
                {i === 0 ? '—' : gb(t).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
