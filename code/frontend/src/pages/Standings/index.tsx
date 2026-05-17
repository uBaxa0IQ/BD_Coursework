import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import type { Standing } from '../../types'

export default function Standings() {
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [standings, setStandings] = useState<{ East: Standing[]; West: Standing[] }>({ East: [], West: [] })
  const [activeTab, setActiveTab] = useState<'East' | 'West'>('East')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamsApi.getStandings(seasonId).then(setStandings).finally(() => setLoading(false))
  }, [seasonId])

  if (loading) return <div className="loading">Загрузка...</div>

  const list = standings[activeTab]
  const leader = list[0]
  const gb = (t: Standing) => {
    if (!leader) return 0
    return ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['East', 'West'] as const).map(conf => (
          <button
            key={conf}
            className={`btn ${activeTab === conf ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(conf)}
          >
            {conf === 'East' ? '🌅 Восток' : '🌄 Запад'}
          </button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {['#', '', 'Команда', 'W', 'L', 'W%', 'GB'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: h === '' ? 'center' : 'left', fontWeight: 500, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((t, i) => (
            <tr
              key={t.team_id}
              onClick={() => navigate(`/teams/${t.team_id}`)}
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 30 }}>{i + 1}</td>
              <td style={{ padding: '8px 12px', width: 44 }}>
                <img
                  src={`https://cdn.nba.com/logos/nba/${t.nba_team_id}/global/L/logo.svg`}
                  alt=""
                  style={{ width: 28, height: 28 }}
                  onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                />
              </td>
              <td style={{ padding: '8px 12px', fontWeight: i < 8 ? 600 : 400 }}>{t.name}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{t.wins}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{t.losses}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                {t.win_pct != null ? (Number(t.win_pct) * 100).toFixed(1) + '%' : '—'}
              </td>
              <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {i === 0 ? '—' : gb(t).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
