import client from './client'
import type { Standing, Team } from '../types'

export const teamsApi = {
  getList: () =>
    client.get<Team[]>('/teams').then(r => r.data),

  getStandings: (seasonId: number) =>
    client
      .get<{ East: Standing[]; West: Standing[] }>('/teams/standings', { params: { season_id: seasonId } })
      .then(r => r.data),

  getById: (id: number) =>
    client.get<Team>(`/teams/${id}`).then(r => r.data),

  getRoster: (id: number, seasonId: number) =>
    client.get(`/teams/${id}/roster`, { params: { season_id: seasonId } }).then(r => r.data),

  getGames: (id: number, seasonId?: number) =>
    client.get(`/teams/${id}/games`, { params: seasonId ? { season_id: seasonId } : {} }).then(r => r.data),

  getAvgStats: (seasonId: number, limit = 10) =>
    client.get<{ team_abbreviation: string; avg_pts: number }[]>('/teams/stats', {
      params: { season_id: seasonId, limit, order_by: 'avg_pts' },
    }).then(r => r.data).catch(() => [] as { team_abbreviation: string; avg_pts: number }[]),
}
