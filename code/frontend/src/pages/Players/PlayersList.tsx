import { useEffect, useState } from 'react'
import { playersApi } from '../../api/players'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { useDebounce } from '../../hooks/useDebounce'
import PlayerModal from '../../components/PlayerModal'
import type { Player, Team } from '../../types'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const PAGE_SIZE = 20

export default function PlayersList() {
  const { seasonId } = useSeasonFilter()
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('')
  const [teamId, setTeamId] = useState<number | undefined>()
  const [page, setPage] = useState(0)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
  const debouncedSearch = useDebounce(search, 400)

  useEffect(() => {
    teamsApi.getList().then(setTeams).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    playersApi.getList(seasonId, {
      position: position || undefined,
      team_id: teamId,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }).then(setPlayers).finally(() => setLoading(false))
  }, [seasonId, position, teamId, debouncedSearch, page])

  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'

  const selectStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="search player..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          style={{
            ...selectStyle,
            flex: 1,
            minWidth: 180,
          }}
        />
        <select value={position} onChange={e => { setPosition(e.target.value); setPage(0) }} style={selectStyle}>
          <option value="">all positions</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={teamId ?? ''}
          onChange={e => { setTeamId(e.target.value ? Number(e.target.value) : undefined); setPage(0) }}
          style={selectStyle}
        >
          <option value="">all teams</option>
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.abbreviation}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading">loading...</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['', 'player', 'team', 'pos', 'gp', 'pts', 'reb', 'ast', 'per', 'ts%'].map(h => (
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
                {players.map(p => (
                  <tr
                    key={p.player_id}
                    onClick={() => setSelectedPlayer(p.player_id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '7px 10px', width: 40 }}>
                      <img
                        src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nba_id}.png`}
                        alt=""
                        style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)', display: 'block' }}
                        onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                      />
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{p.first_name} {p.last_name}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.team_abbreviation || '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{p.games_played ?? '—'}</td>
                    <td style={{ padding: '7px 10px' }}>{fmt(p.avg_pts)}</td>
                    <td style={{ padding: '7px 10px' }}>{fmt(p.avg_reb)}</td>
                    <td style={{ padding: '7px 10px' }}>{fmt(p.avg_ast)}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--accent)', fontWeight: 600 }}>{fmt(p.per)}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>
                      {p.ts_pct ? (Number(p.ts_pct) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← prev</button>
            <span style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{page + 1}</span>
            <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={players.length < PAGE_SIZE}>next →</button>
          </div>
        </>
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
