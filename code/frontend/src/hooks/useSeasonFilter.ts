import { useState, useEffect, createContext, useContext } from 'react'
import { leagueApi } from '../api/league'
import type { Season } from '../types'
import { SEASONS } from '../types'

interface SeasonContextType {
  seasonId: number
  seasonLabel: string
  seasons: Season[]
  setSeasonId: (id: number) => void
}

export const SeasonContext = createContext<SeasonContextType>({
  seasonId: 5,
  seasonLabel: '2023-24',
  seasons: SEASONS,
  setSeasonId: () => {},
})

export const useSeasonFilter = () => useContext(SeasonContext)

export function useSeasonState() {
  const [seasons, setSeasons] = useState<Season[]>(SEASONS)
  const [seasonId, setSeasonIdRaw] = useState(5)

  useEffect(() => {
    leagueApi
      .getSeasons()
      .then(list => {
        if (!list.length) return
        setSeasons(list)
        setSeasonIdRaw(prev =>
          list.some(s => s.season_id === prev) ? prev : list[list.length - 1].season_id
        )
      })
      .catch(() => {})
  }, [])

  const seasonLabel =
    seasons.find(s => s.season_id === seasonId)?.label ?? '2023-24'

  const setSeasonId = (id: number) => setSeasonIdRaw(id)

  return { seasonId, seasonLabel, seasons, setSeasonId }
}
