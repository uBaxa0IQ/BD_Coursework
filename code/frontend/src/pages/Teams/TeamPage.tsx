import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from 'recharts'
import { teamsApi } from '../../api/teams'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import PlayerModal from '../../components/PlayerModal'
import BoxscoreModal from '../../components/BoxscoreModal'
import { useSortable } from '../../hooks/useSortable'
import type { Team, TeamSummary } from '../../types'

// Нормировочные максимумы для радара сравнения команд (за матч)
const RADAR_MAXES = {
  avg_pts: 125,
  avg_reb: 50,
  avg_ast: 32,
  efg_pct: 0.6,
  ts_pct: 0.62,
  win_pct: 1.0,
}

const norm = (v: number | string | null | undefined, max: number): number => {
  if (v == null) return 0
  return Math.min(1, Math.max(0, Number(v) / max))
}

const num = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v)

const fmt = (v?: number | string | null, dec = 1) => (v != null ? Number(v).toFixed(dec) : '—')
const pct = (v?: number | string | null) => (v != null ? (Number(v) * 100).toFixed(1) + '%' : '—')

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { seasonId } = useSeasonFilter()
  const [team, setTeam] = useState<Team | null>(null)
  const [summary, setSummary] = useState<TeamSummary | null>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [games, setGames] = useState<any[]>([])
  const [teamsList, setTeamsList] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
  const [selectedGame, setSelectedGame] = useState<number | null>(null)
  // Сравнение команд (C) — выбранный соперник хранится в URL (?vs=), переживает back/refresh
  const [searchParams, setSearchParams] = useSearchParams()
  const rawVs = searchParams.get('vs') ? Number(searchParams.get('vs')) : null
  const compareId = rawVs != null && rawVs !== Number(id) ? rawVs : null
  const setCompareId = (v: number | null) =>
    setSearchParams(p => {
      const np = new URLSearchParams(p)
      if (v != null) np.set('vs', String(v)); else np.delete('vs')
      return np
    }, { replace: true })
  const [compareTeam, setCompareTeam] = useState<Team | null>(null)
  const [compareSummary, setCompareSummary] = useState<TeamSummary | null>(null)
  const { sorted, toggle, indicator } = useSortable<any>(roster)

  useEffect(() => {
    if (!id) return
    const tid = Number(id)
    setLoading(true)
    Promise.all([
      teamsApi.getById(tid),
      teamsApi.getSummary(tid, seasonId).catch(() => null),
      teamsApi.getRoster(tid, seasonId),
      teamsApi.getGames(tid, seasonId).catch(() => []),
      teamsApi.getList().catch(() => [] as Team[]),
    ]).then(([t, s, r, g, list]) => {
      setTeam(t)
      setSummary(s)
      setRoster(r)
      setGames(g)
      setTeamsList(list)
    }).finally(() => setLoading(false))
  }, [id, seasonId])

  // Загрузка второй команды для сравнения
  useEffect(() => {
    if (compareId == null) {
      setCompareSummary(null)
      setCompareTeam(null)
      return
    }
    Promise.all([
      teamsApi.getById(compareId),
      teamsApi.getSummary(compareId, seasonId).catch(() => null),
    ]).then(([t, s]) => {
      setCompareTeam(t)
      setCompareSummary(s)
    })
  }, [compareId, seasonId])

  // Форма: последние 10 завершённых матчей (B)
  const tid = Number(id)
  const abbrById = useMemo(() => {
    const m = new Map<number, { abbr: string; nba: number }>()
    teamsList.forEach(t => m.set(t.team_id, { abbr: t.abbreviation, nba: t.nba_team_id }))
    return m
  }, [teamsList])

  const form = useMemo(() => {
    return games
      .filter(g => g.status === 'Finished' && g.home_score != null && g.away_score != null)
      .slice(0, 10)
      .map(g => {
        const isHome = g.home_team_id === tid
        const teamScore = isHome ? g.home_score : g.away_score
        const oppScore = isHome ? g.away_score : g.home_score
        const oppId = isHome ? g.away_team_id : g.home_team_id
        return {
          game_id: g.game_id,
          date: g.game_date,
          win: teamScore > oppScore,
          teamScore,
          oppScore,
          isHome,
          oppAbbr: abbrById.get(oppId)?.abbr ?? '—',
        }
      })
  }, [games, tid, abbrById])

  if (loading) return <div className="loading">loading...</div>
  if (!team) return <div className="error">team not found</div>

  const cols: { label: string; key?: string; title?: string }[] = [
    { label: '' },
    { label: 'player', key: 'last_name' },
    { label: 'pos', key: 'position' },
    { label: 'gp', key: 'games_played' },
    { label: 'pts', key: 'avg_pts' },
    { label: 'reb', key: 'avg_reb' },
    { label: 'ast', key: 'avg_ast' },
    { label: 'per', key: 'per' },
    { label: '±', key: 'avg_plus_minus', title: 'средний показатель плюс-минус за матч' },
  ]

  // Метрики сводки (A)
  const netv = summary?.net_rtg
  const netStr = netv != null ? (Number(netv) >= 0 ? '+' : '') + Number(netv).toFixed(1) : '—'
  const netColor = netv != null ? (Number(netv) >= 0 ? 'var(--success)' : 'var(--danger)') : undefined
  const tiles: { label: string; value: string; sub?: string; color?: string }[] = summary ? [
    { label: 'PTS', value: fmt(summary.avg_pts), sub: summary.pts_rank ? `league #${summary.pts_rank}` : undefined },
    { label: 'REB', value: fmt(summary.avg_reb) },
    { label: 'AST', value: fmt(summary.avg_ast) },
    { label: 'TOV', value: fmt(summary.avg_tov) },
    { label: 'eFG%', value: pct(summary.efg_pct) },
    { label: 'TS%', value: pct(summary.ts_pct) },
    { label: 'ORtg', value: fmt(summary.off_rtg) },
    { label: 'DRtg', value: fmt(summary.def_rtg) },
    { label: 'NET', value: netStr, color: netColor },
  ] : []

  // Единый ростер; ушедших по ходу сезона помечаем красным (по is_current)
  const rosterCard = (list: any[], label: string) => {
    const hasFormer = list.some((p: any) => p.is_current === false)
    const hasArrival = list.some((p: any) => p.is_current !== false && p.arrived_mid_season)
    return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ display: 'flex', gap: 12 }}>
          {hasArrival && <span style={{ fontSize: 10, color: 'var(--success)' }}>● joined mid-season</span>}
          {hasFormer && <span style={{ fontSize: 10, color: 'var(--danger)' }}>● left mid-season</span>}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map(c => (
              <th
                key={c.label}
                title={c.title}
                onClick={c.key ? () => toggle(c.key!) : undefined}
                style={{
                  padding: '6px 10px',
                  textAlign: c.label === '' ? 'center' : 'left',
                  fontWeight: 500, fontSize: 10, color: 'var(--text-muted)',
                  cursor: c.key ? 'pointer' : 'default', userSelect: 'none',
                }}
              >
                {c.label}{c.key ? indicator(c.key) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((p: any) => (
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
              <td
                style={{ padding: '6px 10px', fontWeight: 500, color: p.is_current === false ? 'var(--danger)' : (p.arrived_mid_season ? 'var(--success)' : undefined) }}
                title={p.is_current === false ? 'left mid-season' : (p.arrived_mid_season ? 'joined mid-season' : undefined)}
              >
                {p.first_name} {p.last_name}
              </td>
              <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{p.position || '—'}</td>
              <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{p.games_played ?? '—'}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(p.avg_pts)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(p.avg_reb)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(p.avg_ast)}</td>
              <td style={{ padding: '6px 10px', color: 'var(--accent)', fontWeight: 600 }}>{fmt(p.per)}</td>
              {(() => {
                const pm = p.avg_plus_minus != null ? Number(p.avg_plus_minus) : null
                return (
                  <td style={{ padding: '6px 10px', fontWeight: 600, color: pm == null ? 'var(--text-muted)' : (pm >= 0 ? 'var(--success)' : 'var(--danger)') }}>
                    {pm == null ? '—' : (pm >= 0 ? '+' : '') + pm.toFixed(1)}
                  </td>
                )
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    )
  }

  // Данные радара сравнения (C)
  const radarData = (compareSummary && summary) ? [
    { axis: 'PTS', a: norm(summary.avg_pts, RADAR_MAXES.avg_pts), b: norm(compareSummary.avg_pts, RADAR_MAXES.avg_pts) },
    { axis: 'REB', a: norm(summary.avg_reb, RADAR_MAXES.avg_reb), b: norm(compareSummary.avg_reb, RADAR_MAXES.avg_reb) },
    { axis: 'AST', a: norm(summary.avg_ast, RADAR_MAXES.avg_ast), b: norm(compareSummary.avg_ast, RADAR_MAXES.avg_ast) },
    { axis: 'eFG%', a: norm(summary.efg_pct, RADAR_MAXES.efg_pct), b: norm(compareSummary.efg_pct, RADAR_MAXES.efg_pct) },
    { axis: 'TS%', a: norm(summary.ts_pct, RADAR_MAXES.ts_pct), b: norm(compareSummary.ts_pct, RADAR_MAXES.ts_pct) },
    { axis: 'W%', a: norm(summary.win_pct, RADAR_MAXES.win_pct), b: norm(compareSummary.win_pct, RADAR_MAXES.win_pct) },
  ] : []

  // Метрики для таблицы сравнения (lower=true → меньше лучше)
  const cmpMetrics: { key: keyof TeamSummary; label: string; isPct?: boolean; lower?: boolean }[] = [
    { key: 'win_pct', label: 'W%', isPct: true },
    { key: 'net_rtg', label: 'NET' },
    { key: 'off_rtg', label: 'ORtg' },
    { key: 'def_rtg', label: 'DRtg', lower: true },
    { key: 'avg_pts', label: 'PTS' },
    { key: 'avg_reb', label: 'REB' },
    { key: 'avg_ast', label: 'AST' },
    { key: 'avg_tov', label: 'TOV', lower: true },
    { key: 'efg_pct', label: 'eFG%', isPct: true },
    { key: 'ts_pct', label: 'TS%', isPct: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button
        className="btn btn-ghost"
        onClick={() => navigate('/teams')}
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
      >
        ← Standings
      </button>

      {/* Team header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img
          src={`https://cdn.nba.com/logos/nba/${team.nba_team_id}/global/L/logo.svg`}
          alt={team.name}
          style={{ width: 64, height: 64 }}
          onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{team.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {team.conference}
            {team.arena_name && ` · ${team.arena_name}`}
          </div>
        </div>
        {/* Запись и место (A) */}
        {summary && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {summary.wins}–{summary.losses}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              W% {fmt(summary.win_pct, 3)}
              {summary.conf_rank && ` · #${summary.conf_rank} ${summary.conference}`}
            </div>
          </div>
        )}
      </div>

      {/* Сводка командных метрик (A) */}
      {summary && tiles.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            team per-game stats · {summary.season}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
            gap: 12,
          }}>
            {tiles.map(t => (
              <div key={t.label} style={{
                padding: '12px 14px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4, color: t.color }}>{t.value}</div>
                {t.sub && <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>{t.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Сравнение команд (C) */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>team comparison</div>
          <select
            value={compareId ?? ''}
            onChange={e => setCompareId(e.target.value ? Number(e.target.value) : null)}
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            <option value="">select opponent…</option>
            {teamsList
              .filter(t => t.team_id !== tid)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
          </select>
        </div>

        {compareId == null && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Pick a second team to compare {summary?.season} stats.
          </div>
        )}

        {compareId != null && compareSummary && compareTeam && summary && (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData} outerRadius={92}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} />
                <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                <Radar name={team.abbreviation} dataKey="a" stroke="#4ade80" fill="#4ade80" fillOpacity={0.2} strokeWidth={2} />
                <Radar name={compareTeam.abbreviation} dataKey="b" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.2} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} />
              </RadarChart>
            </ResponsiveContainer>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: '#4ade80', width: '30%' }}>{team.abbreviation}</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', width: '40%' }}>metric</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: 10, color: '#60a5fa', width: '30%' }}>{compareTeam.abbreviation}</th>
                </tr>
              </thead>
              <tbody>
                {cmpMetrics.map(m => {
                  const va = num(summary[m.key] as any)
                  const vb = num(compareSummary[m.key] as any)
                  let aBetter = false, bBetter = false
                  if (va != null && vb != null && va !== vb) {
                    const aWins = m.lower ? va < vb : va > vb
                    aBetter = aWins
                    bBetter = !aWins
                  }
                  const show = (v: number | null) => v == null ? '—' : m.isPct ? pct(v) : v.toFixed(1)
                  return (
                    <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: aBetter ? 700 : 400, color: aBetter ? '#4ade80' : 'var(--text-primary)' }}>{show(va)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: bBetter ? 700 : 400, color: bBetter ? '#60a5fa' : 'var(--text-primary)' }}>{show(vb)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Форма / последние матчи (B) */}
      {form.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            form · last {form.length}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {form.map(f => (
              <span
                key={f.game_id}
                title={`${f.isHome ? 'vs' : '@'} ${f.oppAbbr} ${f.teamScore}–${f.oppScore} (${f.date})`}
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  background: f.win ? '#16a34a' : '#dc2626',
                }}
              >
                {f.win ? 'W' : 'L'}
              </span>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {form.map(f => (
                <tr
                  key={f.game_id}
                  onClick={() => setSelectedGame(f.game_id)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '5px 10px', color: 'var(--text-secondary)' }}>{f.date}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{f.isHome ? 'vs' : '@'} {f.oppAbbr}</td>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)' }}>{f.teamScore}–{f.oppScore}</td>
                  <td style={{ padding: '5px 10px', fontWeight: 700, color: f.win ? '#16a34a' : '#dc2626' }}>{f.win ? 'W' : 'L'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roster: единая таблица, ушедшие по ходу сезона помечены красным */}
      {sorted.length > 0 && rosterCard(sorted, 'roster')}

      {selectedPlayer != null && (
        <PlayerModal
          playerId={selectedPlayer}
          seasonId={seasonId}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {selectedGame != null && (
        <BoxscoreModal gameId={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}
