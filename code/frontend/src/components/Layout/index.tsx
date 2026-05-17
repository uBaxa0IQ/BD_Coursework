import { Outlet } from 'react-router-dom'
import { useMemo } from 'react'
import TopBar from './TopBar'
import { SeasonContext, useSeasonState } from '../../hooks/useSeasonFilter'
import { CompareProvider } from '../../context/CompareContext'

export default function Layout() {
  const season = useSeasonState()
  const contextValue = useMemo(
    () => ({ ...season }),
    [season.seasonId, season.seasonLabel, season.seasons]
  )

  return (
    <SeasonContext.Provider value={contextValue}>
      <CompareProvider seasonId={season.seasonId}>
        <div className="layout">
          <TopBar />
          <div className="page-content">
            <Outlet />
          </div>
        </div>
      </CompareProvider>
    </SeasonContext.Provider>
  )
}
