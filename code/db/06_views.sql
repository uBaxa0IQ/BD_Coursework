-- ============================================================
-- NBA Statistics Database — Представления (Views)
-- Файл: 06_views.sql
-- Описание: Представления для аналитики, лидербордов и таблиц
-- ============================================================

-- ============================================================
-- VIEW: v_player_rankings
-- Полный рейтинг игроков со всеми метриками (для analyst + db_admin)
-- ============================================================
CREATE OR REPLACE VIEW v_player_rankings AS
SELECT
    p.player_id,
    p.first_name || ' ' || p.last_name  AS full_name,
    p.nba_id,
    t.name                               AS team_name,
    t.abbreviation,
    t.nba_team_id,
    pos.code                             AS position,
    s.label                              AS season,
    s.season_id,
    pss.games_played,
    pss.avg_pts,
    pss.avg_reb,
    pss.avg_ast,
    pss.avg_stl,
    pss.avg_blk,
    pss.avg_tov,
    pss.avg_min,
    pss.fg_pct,
    pss.fg3_pct,
    pss.ft_pct,
    pss.avg_plus_minus,
    pss.efg_pct,
    pss.ts_pct,
    pss.usg_pct,
    pss.per,
    pss.bpm
FROM player_season_stats pss
JOIN players   p   ON p.player_id   = pss.player_id
JOIN teams     t   ON t.team_id     = pss.team_id
JOIN seasons   s   ON s.season_id   = pss.season_id
LEFT JOIN positions pos ON pos.position_id = p.position_id
ORDER BY pss.per DESC NULLS LAST;

COMMENT ON VIEW v_player_rankings IS
    'Полный рейтинг игроков NBA с расчётными метриками за все сезоны.
     Доступно для ролей: analyst, db_admin.';

-- ============================================================
-- VIEW: v_team_standings
-- Турнирная таблица команд (для analyst + db_admin)
-- ============================================================
CREATE OR REPLACE VIEW v_team_standings AS
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

COMMENT ON VIEW v_team_standings IS
    'Турнирная таблица команд NBA: победы, поражения, процент побед за каждый сезон.
     Доступно для ролей: analyst, db_admin.';

-- ============================================================
-- VIEW: v_team_stats
-- Средняя командная статистика за матч по сезону (без отдельной таблицы фактов)
-- ============================================================
CREATE OR REPLACE VIEW v_team_stats AS
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

COMMENT ON VIEW v_team_stats IS
    'Средние показатели команды за матч в разрезе сезона (агрегат из game_player_stats).
     Доступно для ролей: analyst, db_admin, reader.';

-- ============================================================
-- VIEW: v_top_players
-- Краткая сводка лидеров по PER (для reader + analyst + db_admin)
-- ============================================================
CREATE OR REPLACE VIEW v_top_players AS
SELECT
    full_name,
    team_name,
    position,
    season,
    avg_pts,
    avg_reb,
    avg_ast,
    per
FROM v_player_rankings
WHERE per IS NOT NULL
ORDER BY per DESC;

COMMENT ON VIEW v_top_players IS
    'Краткая сводка лидеров NBA по рейтингу PER.
     Доступно для ролей: reader, analyst, db_admin.';

-- ============================================================
-- ПРАВА НА ПРЕДСТАВЛЕНИЯ
-- ============================================================
GRANT SELECT ON v_player_rankings TO analyst, db_admin;
GRANT SELECT ON v_team_stats      TO analyst, db_admin, reader;
GRANT SELECT ON v_team_standings  TO analyst, db_admin, reader;
GRANT SELECT ON v_top_players     TO reader, analyst, db_admin;
