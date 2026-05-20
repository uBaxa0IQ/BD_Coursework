-- ============================================================
-- Migration: remove teams.division
-- Safe on fresh installs (DROP IF EXISTS) and existing DBs.
-- ============================================================

DROP VIEW IF EXISTS v_team_stats;
DROP VIEW IF EXISTS v_team_standings;

CREATE VIEW v_team_standings AS
SELECT
    t.team_id,
    t.name,
    t.abbreviation,
    t.city,
    t.conference,
    t.nba_team_id,
    s.season_id,
    s.label AS season,
    COUNT(CASE
        WHEN (g.home_team_id = t.team_id AND g.home_score > g.away_score)
          OR (g.away_team_id = t.team_id AND g.away_score > g.home_score)
        THEN 1
    END) AS wins,
    COUNT(CASE
        WHEN (g.home_team_id = t.team_id AND g.home_score < g.away_score)
          OR (g.away_team_id = t.team_id AND g.away_score < g.home_score)
        THEN 1
    END) AS losses,
    COUNT(g.game_id) AS games_played,
    ROUND(
        COUNT(CASE
            WHEN (g.home_team_id = t.team_id AND g.home_score > g.away_score)
              OR (g.away_team_id = t.team_id AND g.away_score > g.home_score)
            THEN 1
        END)::DECIMAL
        / NULLIF(COUNT(g.game_id), 0),
        3
    ) AS win_pct
FROM teams t
CROSS JOIN seasons s
LEFT JOIN games g
    ON (g.home_team_id = t.team_id OR g.away_team_id = t.team_id)
    AND g.season_id = s.season_id
    AND g.status    = 'Finished'
GROUP BY
    t.team_id, t.name, t.abbreviation, t.city,
    t.conference, t.nba_team_id,
    s.season_id, s.label
ORDER BY s.season_id, win_pct DESC NULLS LAST;

CREATE VIEW v_team_stats AS
WITH team_game AS (
    SELECT
        gps.team_id,
        g.season_id,
        g.game_id,
        SUM(gps.points) AS pts,
        SUM(gps.rebounds_off + gps.rebounds_def) AS reb,
        SUM(gps.assists) AS ast,
        SUM(gps.turnovers) AS tov,
        SUM(gps.fgm) AS fgm,
        SUM(gps.fga) AS fga,
        SUM(gps.fg3m) AS fg3m,
        SUM(gps.ftm) AS ftm,
        SUM(gps.fta) AS fta
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE g.status = 'Finished'
    GROUP BY gps.team_id, g.season_id, g.game_id
)
SELECT
    t.team_id,
    t.name AS team_name,
    t.abbreviation,
    t.conference,
    s.season_id,
    s.label AS season,
    COUNT(*)::SMALLINT AS games_played,
    ROUND(AVG(tg.pts)::DECIMAL, 2) AS avg_pts,
    ROUND(AVG(tg.reb)::DECIMAL, 2) AS avg_reb,
    ROUND(AVG(tg.ast)::DECIMAL, 2) AS avg_ast,
    ROUND(AVG(tg.tov)::DECIMAL, 2) AS avg_tov,
    CASE WHEN SUM(tg.fga) > 0
         THEN ROUND((SUM(tg.fgm) + 0.5 * SUM(tg.fg3m))::DECIMAL / SUM(tg.fga), 4)
         ELSE NULL END AS efg_pct,
    CASE WHEN SUM(tg.fga) + SUM(tg.fta) > 0
         THEN ROUND(
             SUM(tg.pts)::DECIMAL
             / (2.0 * (SUM(tg.fga) + 0.44 * SUM(tg.fta))),
             4)
         ELSE NULL END AS ts_pct
FROM team_game tg
JOIN teams t ON t.team_id = tg.team_id
JOIN seasons s ON s.season_id = tg.season_id
GROUP BY
    t.team_id, t.name, t.abbreviation, t.conference,
    s.season_id, s.label
ORDER BY s.season_id, avg_pts DESC NULLS LAST;

ALTER TABLE teams DROP COLUMN IF EXISTS division;
