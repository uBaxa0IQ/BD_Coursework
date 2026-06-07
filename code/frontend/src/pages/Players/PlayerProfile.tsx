import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { playersApi } from '../../api/players'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { useSortable } from '../../hooks/useSortable'
import MetricBadge from '../../components/MetricBadge'
import BoxscoreModal from '../../components/BoxscoreModal'
import PlusMinusHistogram from '../../components/PlusMinusHistogram'
import PercentileBars from '../../components/PercentileBars'
import type { PlayerDetail, PlayerStats, GameLog } from '../../types'

const CAREER_METRICS = [
  { key: 'per', label: 'PER' },
  { key: 'avg_pts', label: 'PTS' },
  { key: 'ts_pct', label: 'TS%' },
  { key: 'bpm', label: 'BPM' },
]

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [player, setPlayer] = useState<PlayerDetail | null>(null)
  const [career, setCareer] = useState<PlayerStats[]>([])
  const [gamelog, setGamelog] = useState<GameLog[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [metric, setMetric] = useState('per')
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<number | null>(null)
  const [league, setLeague] = useState<any[]>([])
  const [advLeague, setAdvLeague] = useState<any[]>([])
  const [showAllLog, setShowAllLog] = useState(false)
  const { sorted: sortedLog, toggle: toggleLog, indicator: logIndicator } = useSortable(gamelog, 'game_date', 'desc')

  useEffect(() => {
    if (!id) return
    const pid = Number(id)
    setLoading(true)
    Promise.all([
      playersApi.getById(pid),
      playersApi.getStats(pid),
      playersApi.getGamelog(pid, seasonId),
      playersApi.getTeams(pid),
      playersApi.getList(seasonId, { limit: 1000 }).catch(() => [] as any[]),
      statsApi.getAdvanced(seasonId).catch(() => [] as any[]),
    ]).then(([p, s, g, t, lg, adv]) => {
      setPlayer(p)
      setCareer(s)
      setGamelog(g)
      setTeams(t)
      setLeague(lg as any[])
      setAdvLeague(adv as any[])
    }).finally(() => setLoading(false))
  }, [id, seasonId])

  if (loading) return <div className="loading">Loading profile...</div>
  if (!player) return <div className="error">Player not found</div>

  const currentSeason = career.find(s => s.season_id === seasonId) || career[career.length - 1]
  const fmt = (v?: number | string | null, dec = 1) => v != null ? Number(v).toFixed(dec) : '—'
  const fmtPct = (v?: number | string | null) => v != null ? (Number(v) * 100).toFixed(1) + '%' : '—'

  // Ранг и перцентиль игрока среди всех игроков сезона (считается на клиенте)
  const rankOf = (key: string, val?: number | string | null) => {
    if (val == null || !league.length) return null
    const v = Number(val)
    if (Number.isNaN(v)) return null
    const vals = league
      .map((r: any) => r[key])
      .filter((x: any) => x != null && x !== '')
      .map(Number)
      .filter((x: number) => !Number.isNaN(x))
    if (!vals.length) return null
    const rank = 1 + vals.filter((x: number) => x > v).length
    const pct = Math.round((100 * vals.filter((x: number) => x <= v).length) / vals.length)
    return { rank, pct, total: vals.length }
  }
  const perR = currentSeason ? rankOf('per', currentSeason.per) : null
  const ptsR = currentSeason ? rankOf('avg_pts', currentSeason.avg_pts) : null

  // Пулы значений лиги для перцентилей (из advanced-датасета сезона)
  const poolOf = (key: string): number[] =>
    advLeague
      .map((r: any) => r[key])
      .filter((x: any) => x != null && x !== '')
      .map(Number)
      .filter((x: number) => Number.isFinite(x))

  const chartData = career.map(s => ({
    season: s.season_label,
    value: metric === 'ts_pct' ? (s[metric as keyof PlayerStats] ? Number(s[metric as keyof PlayerStats]) * 100 : null) : s[metric as keyof PlayerStats],
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/players')}
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
      >
        ← Players
      </button>
      {/* Шапка */}
      <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <img
          src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.nba_id}.png`}
          alt={player.first_name}
          style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}
          onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            {player.nba_team_id && (
              <img
                src={`https://cdn.nba.com/logos/nba/${player.nba_team_id}/global/L/logo.svg`}
                alt=""
                title={player.team_id ? `${player.team_name} — open team` : undefined}
                onClick={() => { if (player.team_id) navigate(`/teams/${player.team_id}`) }}
                style={{ width: 40, height: 40, cursor: player.team_id ? 'pointer' : 'default' }}
                onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
              />
            )}
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>{player.first_name} {player.last_name}</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {player.team_id ? (
                  <span
                    onClick={() => navigate(`/teams/${player.team_id}`)}
                    style={{ cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {player.team_name}
                  </span>
                ) : player.team_name}
                {' · '}{player.position || '—'} · #{player.jersey_number ?? '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            {player.height_cm && <span>Height: {player.height_cm} cm</span>}
            {player.weight_kg && <span>Weight: {player.weight_kg} kg</span>}
            {player.birth_date && <span>DOB: {player.birth_date}</span>}
            {player.nationality && <span>{player.nationality}</span>}
            <span>
              {player.draft_year
                ? `Draft: ${player.draft_year}${player.draft_round ? ` · R${player.draft_round}` : ''}${player.draft_pick ? ` · Pick ${player.draft_pick}` : ''}`
                : 'Undrafted'}
            </span>
          </div>
        </div>
      </div>

      {/* Метрики */}
      {currentSeason && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8, marginBottom: 8 }}>
            <MetricBadge label="GP" value={currentSeason.games_played} precision={0} />
            <MetricBadge label="PTS" value={currentSeason.avg_pts} />
            <MetricBadge label="REB" value={currentSeason.avg_reb} />
            <MetricBadge label="AST" value={currentSeason.avg_ast} />
            <MetricBadge label="STL" value={currentSeason.avg_stl} />
            <MetricBadge label="BLK" value={currentSeason.avg_blk} />
            <MetricBadge label="FG%" value={currentSeason.fg_pct ? Number(currentSeason.fg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="3P%" value={currentSeason.fg3_pct ? Number(currentSeason.fg3_pct) * 100 : null} suffix="%" />
            <MetricBadge label="FT%" value={currentSeason.ft_pct ? Number(currentSeason.ft_pct) * 100 : null} suffix="%" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            <MetricBadge label="PER" value={currentSeason.per} highlight />
            <MetricBadge label="TS%" value={currentSeason.ts_pct ? Number(currentSeason.ts_pct) * 100 : null} suffix="%" />
            <MetricBadge label="eFG%" value={currentSeason.efg_pct ? Number(currentSeason.efg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="USG%" value={currentSeason.usg_pct ? Number(currentSeason.usg_pct) * 100 : null} suffix="%" />
            <MetricBadge label="BPM" value={currentSeason.bpm} />
          </div>
          {(perR || ptsR) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
              Season rank:&nbsp;
              {perR && <span>PER #{perR.rank} of {perR.total} ({perR.pct} pct)</span>}
              {perR && ptsR && <span>&nbsp;·&nbsp;</span>}
              {ptsR && <span>PTS #{ptsR.rank} of {ptsR.total} ({ptsR.pct} pct)</span>}
            </div>
          )}
        </div>
      )}

      {/* Перцентили среди игроков сезона */}
      {currentSeason && advLeague.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
            League percentile (season)
          </h3>
          <PercentileBars
            rows={[
              { label: 'PER', value: currentSeason.per, pool: poolOf('per') },
              { label: 'TS%', value: currentSeason.ts_pct, pool: poolOf('ts_pct'), isPct: true },
              { label: 'USG%', value: currentSeason.usg_pct, pool: poolOf('usg_pct'), isPct: true },
              { label: 'BPM', value: currentSeason.bpm, pool: poolOf('bpm') },
              { label: '+/-', value: currentSeason.avg_plus_minus, pool: poolOf('avg_plus_minus') },
            ]}
          />
        </div>
      )}

      {/* Career Chart */}
      {career.length > 1 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', flex: 1 }}>Career trend</h3>
            {CAREER_METRICS.map(m => (
              <button
                key={m.key}
                className={`btn ${metric === m.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMetric(m.key)}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="season" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis stroke="var(--text-secondary)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Team history */}
      {teams.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>Team history</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {['Season', 'Team', 'Contract'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr
                  key={i}
                  onClick={() => { if (t.team_id) navigate(`/teams/${t.team_id}`) }}
                  style={{ borderBottom: '1px solid var(--border)', cursor: t.team_id ? 'pointer' : 'default', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{t.season}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <img
                        src={`https://cdn.nba.com/logos/nba/${t.nba_team_id}/global/L/logo.svg`}
                        alt=""
                        style={{ width: 20, height: 20 }}
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                      />
                      {t.team_name}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{t.contract_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Распределение +/- по матчам */}
      {(() => {
        const pm = gamelog.map(g => g.plus_minus).filter((v): v is number => v != null)
        return pm.length > 0 ? (
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              Plus/Minus distribution
            </h3>
            <PlusMinusHistogram values={pm} />
          </div>
        ) : null
      })()}

      {/* Game Log */}
      {gamelog.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', flex: 1 }}>Game Log</h3>
            {gamelog.length > 30 && (
              <button
                className="btn btn-ghost"
                onClick={() => setShowAllLog(v => !v)}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {showAllLog ? 'Show recent 30' : `Show all (${gamelog.length})`}
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {([
                    { label: 'Date', key: 'game_date' },
                    { label: 'Opp', key: 'opponent' },
                    { label: 'MIN', key: 'minutes_played' },
                    { label: 'PTS', key: 'points' },
                    { label: 'REB', key: 'rebounds' },
                    { label: 'AST', key: 'assists' },
                    { label: 'FG' },
                    { label: '3P' },
                    { label: 'FT' },
                    { label: '+/-', key: 'plus_minus' },
                  ] as { label: string; key?: string }[]).map(h => (
                    <th
                      key={h.label}
                      onClick={h.key ? () => toggleLog(h.key!) : undefined}
                      style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, fontSize: 11, cursor: h.key ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {h.label}{h.key ? logIndicator(h.key) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(showAllLog ? sortedLog : sortedLog.slice(0, 30)).map((g) => (
                  <tr
                    key={g.game_id}
                    onClick={() => setSelectedGame(g.game_id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{g.game_date}</td>
                    <td style={{ padding: '6px 10px' }}>{g.opponent}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.minutes_played ? Number(g.minutes_played).toFixed(0) : '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{g.points}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.rebounds}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.assists}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.fgm}/{g.fga}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.fg3m}/{g.fg3a}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{g.ftm}/{g.fta}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: (g.plus_minus ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {g.plus_minus != null ? (g.plus_minus >= 0 ? '+' : '') + g.plus_minus : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedGame != null && (
        <BoxscoreModal gameId={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}
