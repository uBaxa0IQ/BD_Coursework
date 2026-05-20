export interface Player {
  player_id: number
  nba_id: number
  first_name: string
  last_name: string
  full_name?: string
  team_name?: string
  team_abbreviation?: string
  nba_team_id?: number
  position?: string
  games_played?: number
  avg_pts?: number
  avg_reb?: number
  avg_ast?: number
  avg_stl?: number
  avg_blk?: number
  avg_tov?: number
  avg_min?: number
  fg_pct?: number
  fg3_pct?: number
  ft_pct?: number
  avg_plus_minus?: number
  efg_pct?: number
  ts_pct?: number
  usg_pct?: number
  per?: number
  bpm?: number
  photo_url?: string
  logo_url?: string
}

export interface PlayerDetail extends Player {
  birth_date?: string
  nationality?: string
  height_cm?: number
  weight_kg?: number
  jersey_number?: number
  is_active?: boolean
  draft_year?: number
  draft_round?: number
  draft_pick?: number
}

export interface PlayerStats {
  season_label: string
  season_id: number
  games_played: number
  avg_pts?: number
  avg_reb?: number
  avg_ast?: number
  avg_stl?: number
  avg_blk?: number
  avg_tov?: number
  avg_min?: number
  fg_pct?: number
  fg3_pct?: number
  ft_pct?: number
  avg_plus_minus?: number
  efg_pct?: number
  ts_pct?: number
  usg_pct?: number
  per?: number
  bpm?: number
}

export interface Team {
  team_id: number
  nba_team_id: number
  name: string
  abbreviation: string
  city: string
  conference: string
  arena_name?: string
  founded_year?: number
  is_active?: boolean
  logo_url?: string
}

export interface Standing {
  team_id: number
  nba_team_id: number
  name: string
  abbreviation: string
  city: string
  conference: string
  season_id: number
  season: string
  wins: number
  losses: number
  games_played: number
  win_pct?: number | string | null
}

export interface LeaderboardEntry {
  rank: number
  player_id: number
  player_name: string
  team_name: string
  team_abbreviation: string
  nba_id: number
  position?: string
  games_played: number
  value?: number
  metric: string
}

export interface GameLog {
  game_id: number
  game_date: string
  opponent: string
  points: number
  rebounds: number
  assists: number
  minutes_played?: number
  plus_minus?: number
  fgm: number
  fga: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  steals: number
  blocks: number
  turnovers: number
}

/** GET /league/dashboard — топ по PER */
export interface DashboardPerPlayer {
  player_id: number
  nba_id: number
  player_name: string
  team_name?: string
  abbreviation: string
  per?: number
  avg_pts?: number
}

export interface LeagueDashboard {
  season_id: number
  avg_pts?: string | null
  avg_3p_pct?: string | null
  active_players?: number
  top_players_per: DashboardPerPlayer[]
}

/** GET /stats/scatter — точка для диаграммы рассеяния */
export interface ScatterPlayerPoint {
  player_id: number
  nba_id: number
  player_name: string
  team: string
  efg_pct?: number | null
  avg_pts?: number | null
  avg_min?: number | null
  games_played?: number
}

export interface LeagueTrend {
  season_id: number
  season: string
  /** AVG(home_score + away_score) по Finished играм */
  avg_total_pts?: number
  avg_pts?: number
  avg_3p_pct?: number
  avg_min?: number
  active_players?: number
}

export interface SearchResult {
  players: Player[]
  teams: Team[]
}

export type SeasonLabel = '2019-20' | '2020-21' | '2021-22' | '2022-23' | '2023-24'

export interface Season {
  season_id: number
  label: SeasonLabel
}

export const SEASONS: Season[] = [
  { season_id: 1, label: '2019-20' },
  { season_id: 2, label: '2020-21' },
  { season_id: 3, label: '2021-22' },
  { season_id: 4, label: '2022-23' },
  { season_id: 5, label: '2023-24' },
]
