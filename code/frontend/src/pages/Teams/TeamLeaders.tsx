import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamsApi } from '../../api/teams'
import { useSortable } from '../../hooks/useSortable'
import { exportCsv } from '../../utils/exportCsv'
import { SHOW_TEAM_NET_RATINGS, TEAM_RATING_KEYS } from '../../config'
import type { Team, TeamSummary } from '../../types'

interface Row {
  team_id: number
  name: string
  abbreviation: string
  nba_team_id: number
  conference: string
  games_played: number | null
  wins: number | null
  losses: number | null
  win_pct: number | null
  avg_pts: number | null
  avg_reb: number | null
  avg_ast: number | null
  avg_tov: number | null
  efg_pct: number | null
  ts_pct: number | null
  off_rtg: number | null
  def_rtg: number | null
  net_rtg: number | null
}

type MetricKey = 'avg_pts' | 'avg_reb' | 'avg_ast' | 'avg_tov' | 'efg_pct' | 'ts_pct' | 'win_pct'
  | 'off_rtg' | 'def_rtg' | 'net_rtg'

const METRICS: { key: MetricKey; label: string; pct: boolean; lower: boolean }[] = [
  { key: 'avg_pts', label: 'PTS', pct: false, lower: false },
  { key: 'avg_reb', label: 'REB', pct: false, lower: false },
  { key: 'avg_ast', label: 'AST', pct: false, lower: false },
  { key: 'avg_tov', label: 'TOV', pct: false, lower: true },
  { key: 'efg_pct', label: 'eFG%', pct: true, lower: false },
  { key: 'ts_pct', label: 'TS%', pct: true, lower: false },
  { key: 'off_rtg', label: 'ORtg', pct: false, lower: false },
  { key: 'def_rtg', label: 'DRtg', pct: false, lower: true },
  { key: 'net_rtg', label: 'NET', pct: false, lower: false },
  { key: 'win_pct', label: 'W%', pct: true, lower: false },
]

// Категории для hero-плиток лидеров (везде больше = лучше)
const HERO: MetricKey[] = ['avg_pts', 'avg_reb', 'avg_ast', 'net_rtg', 'ts_pct', 'win_pct']

// Скрываем командные рейтинги, если выключен флаг SHOW_TEAM_NET_RATINGS
const isRatingKey = (k: string) => (TEAM_RATING_KEYS as readonly string[]).includes(k)
const VISIBLE_METRICS = SHOW_TEAM_NET_RATINGS ? METRICS : METRICS.filter(m => !isRatingKey(m.key))
const VISIBLE_HERO = SHOW_TEAM_NET_RATINGS ? HERO : HERO.filter(k => !isRatingKey(k))

const numv = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

const fmt = (v: number | null, pct: boolean) => (v == null ? '—' : pct ? (v * 100).toFixed(1) + '%' : v.toFixed(1))

// Цвет ячейки по рангу значения в колонке: зелёный = лучший, красный = худший
function cellBg(v: number | null, min: number, max: number, lower: boolean): string {
  if (v == null || max === min) return 'transparent'
  let t = (v - min) / (max - min) // 0..1, 1 = наибольшее значение
  if (lower) t = 1 - t            // для потерь меньше = лучше
  const hue = t * 140             // 0 (красный) .. 140 (зелёный)
  return `hsla(${hue}, 65%, 45%, 0.22)`
}

export default function TeamLeaders({ seasonId }: { seasonId: number }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    teamsApi.getList().then(async (teams: Team[]) => {
      const summaries = await Promise.all(
        teams.map(t => teamsApi.getSummary(t.team_id, seasonId).catch(() => null)),
      )
      if (cancelled) return
      const merged: Row[] = teams.map((t, i) => {
        const s = summaries[i] as TeamSummary | null
        return {
          team_id: t.team_id,
          name: t.name,
          abbreviation: t.abbreviation,
          nba_team_id: t.nba_team_id,
          conference: t.conference,
          games_played: numv(s?.games_played),
          wins: numv(s?.wins),
          losses: numv(s?.losses),
          win_pct: numv(s?.win_pct),
          avg_pts: numv(s?.avg_pts),
          avg_reb: numv(s?.avg_reb),
          avg_ast: numv(s?.avg_ast),
          avg_tov: numv(s?.avg_tov),
          efg_pct: numv(s?.efg_pct),
          ts_pct: numv(s?.ts_pct),
          off_rtg: numv(s?.off_rtg),
          def_rtg: numv(s?.def_rtg),
          net_rtg: numv(s?.net_rtg),
        }
      }).filter(r => r.avg_pts != null) // команды без статистики за сезон отсеиваем
      setRows(merged)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [seasonId])

  // min/max по каждой метрике для хитмэпа
  const bounds = useMemo(() => {
    const b: Record<string, { min: number; max: number }> = {}
    for (const m of VISIBLE_METRICS) {
      const vals = rows.map(r => r[m.key]).filter((v): v is number => v != null)
      b[m.key] = { min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0 }
    }
    return b
  }, [rows])

  // лидеры по категориям для hero-плиток
  const leaders = useMemo(() => {
    return VISIBLE_HERO.map(key => {
      let best: Row | null = null
      for (const r of rows) {
        if (r[key] == null) continue
        if (!best || (r[key] as number) > (best[key] as number)) best = r
      }
      const meta = METRICS.find(m => m.key === key)!
      return { key, meta, team: best }
    })
  }, [rows])

  const { sorted, toggle, indicator } = useSortable<Row>(rows, 'win_pct', 'desc')

  const handleExport = () =>
    exportCsv(
      `team_leaders_season${seasonId}.csv`,
      sorted.map((r, i) => ({
        rank: i + 1,
        team: r.name,
        abbr: r.abbreviation,
        gp: r.games_played,
        w: r.wins,
        l: r.losses,
        win_pct: r.win_pct,
        pts: r.avg_pts,
        reb: r.avg_reb,
        ast: r.avg_ast,
        tov: r.avg_tov,
        efg_pct: r.efg_pct,
        ts_pct: r.ts_pct,
        ...(SHOW_TEAM_NET_RATINGS ? {
          off_rtg: r.off_rtg,
          def_rtg: r.def_rtg,
          net_rtg: r.net_rtg,
        } : {}),
      })),
    )

  if (loading) return <div className="loading">loading...</div>
  if (rows.length === 0) return <div className="error">no team data for season</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* A — hero-плитки лидеров по категориям */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {leaders.map(({ key, meta, team }) => (
          <div
            key={key}
            className="card"
            onClick={() => team && navigate(`/teams/${team.team_id}`)}
            style={{ cursor: team ? 'pointer' : 'default', textAlign: 'center', padding: '14px 10px' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</div>
            {team ? (
              <>
                <img
                  src={`https://cdn.nba.com/logos/nba/${team.nba_team_id}/global/L/logo.svg`}
                  alt={team.abbreviation}
                  style={{ width: 40, height: 40, margin: '8px auto 4px' }}
                  onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                />
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {fmt(team[key], meta.pct)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{team.abbreviation}</div>
              </>
            ) : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>—</div>}
          </div>
        ))}
      </div>

      {/* C — хитмэп-таблица всех команд */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={handleExport} style={{ fontSize: 12 }} title="export current view to CSV">
          ⤓ csv
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {([
                  { label: '#' },
                  { label: '' },
                  { label: 'team', key: 'name' },
                  { label: 'gp', key: 'games_played' },
                  { label: 'w-l', key: 'wins' },
                  ...VISIBLE_METRICS.map(m => ({ label: m.label, key: m.key })),
                ] as { label: string; key?: string }[]).map(c => (
                  <th
                    key={c.label}
                    onClick={c.key ? () => toggle(c.key!) : undefined}
                    style={{
                      padding: '8px 10px',
                      textAlign: c.label === '' || c.label === '#' ? 'center' : 'left',
                      fontWeight: 500, fontSize: 10, color: 'var(--text-muted)',
                      cursor: c.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}{c.key ? indicator(c.key) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.team_id}
                  onClick={() => navigate(`/teams/${r.team_id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 28, textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', width: 40 }}>
                    <img
                      src={`https://cdn.nba.com/logos/nba/${r.nba_team_id}/global/L/logo.svg`}
                      alt=""
                      style={{ width: 26, height: 26, display: 'block' }}
                      onError={e => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                    />
                  </td>
                  <td style={{ padding: '7px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r.games_played ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {r.wins ?? '—'}-{r.losses ?? '—'}
                  </td>
                  {VISIBLE_METRICS.map(m => (
                    <td
                      key={m.key}
                      style={{
                        padding: '7px 10px',
                        fontFamily: 'var(--font-mono)',
                        background: cellBg(r[m.key], bounds[m.key].min, bounds[m.key].max, m.lower),
                      }}
                    >
                      {fmt(r[m.key], m.pct)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
