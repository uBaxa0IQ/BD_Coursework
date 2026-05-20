-- Заполнение home_score / away_score из суммы очков игроков в box score
-- (load_data.py не пишет счёт в games; без этого trends.avg_total_pts = NULL)

UPDATE games g
SET
    home_score = sub.home_pts,
    away_score = sub.away_pts
FROM (
    SELECT
        gps.game_id,
        SUM(CASE WHEN gps.team_id = g2.home_team_id THEN gps.points ELSE 0 END)::SMALLINT AS home_pts,
        SUM(CASE WHEN gps.team_id = g2.away_team_id THEN gps.points ELSE 0 END)::SMALLINT AS away_pts
    FROM game_player_stats gps
    JOIN games g2 ON g2.game_id = gps.game_id
    GROUP BY gps.game_id, g2.home_team_id, g2.away_team_id
) sub
WHERE g.game_id = sub.game_id
  AND (g.home_score IS NULL OR g.away_score IS NULL);

-- NaN в float-метриках (PostgreSQL: NaN IS NOT NULL, но NaN <> NaN)
UPDATE player_season_stats SET per = NULL WHERE per IS NOT NULL AND upper(per::text) = 'NAN';
UPDATE player_season_stats SET bpm = NULL WHERE bpm IS NOT NULL AND upper(bpm::text) = 'NAN';
UPDATE player_season_stats SET ts_pct = NULL WHERE ts_pct IS NOT NULL AND upper(ts_pct::text) = 'NAN';
UPDATE player_season_stats SET efg_pct = NULL WHERE efg_pct IS NOT NULL AND upper(efg_pct::text) = 'NAN';
UPDATE player_season_stats SET usg_pct = NULL WHERE usg_pct IS NOT NULL AND upper(usg_pct::text) = 'NAN';
