import client from './client'
import type { Player, PlayerDetail, PlayerStats, GameLog } from '../types'

export const playersApi = {
  getList: (seasonId: number, params?: {
    position?: string
    team_id?: number
    search?: string
    limit?: number
    offset?: number
  }) =>
    client.get<Player[]>('/players', { params: { season_id: seasonId, ...params } })
      .then(r => r.data),

  getById: (id: number) =>
    client.get<PlayerDetail>(`/players/${id}`).then(r => r.data),

  getStats: (id: number, seasonId?: number) =>
    client.get<PlayerStats[]>(`/players/${id}/stats`, {
      params: seasonId ? { season_id: seasonId } : {},
    }).then(r => r.data),

  getGamelog: (id: number, seasonId: number) =>
    client.get<GameLog[]>(`/players/${id}/gamelog`, {
      params: { season_id: seasonId },
    }).then(r => r.data),

  getCareer: (id: number) =>
    client.get(`/players/${id}/career`).then(r => r.data),

  getTeams: (id: number) =>
    client.get(`/players/${id}/teams`).then(r => r.data),
}
