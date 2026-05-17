import client from './client'
import type { LeagueDashboard, LeagueTrend, SearchResult, Season } from '../types'

export const leagueApi = {
  getSeasons: () =>
    client.get<Season[]>('/league/seasons').then(r => r.data),

  getTrends: () =>
    client.get<LeagueTrend[]>('/league/trends').then(r => r.data),

  getDashboard: (seasonId: number) =>
    client.get<LeagueDashboard>('/league/dashboard', {
      params: { season_id: seasonId },
    }).then(r => r.data),

  search: (q: string) =>
    client.get<SearchResult>('/league/search', { params: { q } }).then(r => r.data),
}
