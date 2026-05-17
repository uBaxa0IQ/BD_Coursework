import client from './client'
import type { LeaderboardEntry, ScatterPlayerPoint } from '../types'

export const statsApi = {
  getLeaders: (params: {
    metric: string
    season_id: number
    team_id?: number
    position?: string
    min_games?: number
    limit?: number
  }) =>
    client.get<LeaderboardEntry[]>('/stats/leaders', { params }).then(r => r.data),

  getAdvanced: (seasonId: number) =>
    client.get('/stats/advanced', { params: { season_id: seasonId } }).then(r => r.data),

  getScatter: (seasonId: number) =>
    client.get<ScatterPlayerPoint[]>('/stats/scatter', { params: { season_id: seasonId } }).then(r => r.data),

  getBoxscore: (gameId: number) =>
    client.get(`/stats/boxscore/${gameId}`).then(r => r.data),

  comparePlayers: (p1Id: number, p2Id: number, seasonId: number) =>
    client.get('/stats/compare/players', {
      params: { p1_id: p1Id, p2_id: p2Id, season_id: seasonId },
    }).then(r => r.data),
}
