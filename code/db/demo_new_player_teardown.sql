-- ============================================================
-- ОТКАТ ДЕМО "новый игрок"
-- Файл: demo_new_player_teardown.sql
-- Удаляет демо-матчи, агрегат и самого игрока, пересчитывает сезон.
-- ============================================================
BEGIN;

-- Удалить демо-матчи (CASCADE удалит и game_player_stats этих матчей)
DELETE FROM games
WHERE season_id = 5
  AND home_team_id = 14 AND away_team_id = 2
  AND game_date IN (DATE '2026-06-05', DATE '2026-06-06');

-- Удалить агрегат вымышленного игрока и его самого
DELETE FROM player_season_stats
WHERE player_id = (SELECT player_id FROM players WHERE nba_id = 9990001);
DELETE FROM players WHERE nba_id = 9990001;

-- Пересчитать сезон (восстановить статистику затронутых реальных игроков, напр. Brown)
CALL update_season_stats(5);

COMMIT;

\echo '=== После отката: игрок удалён ==='
SELECT count(*) AS zhuravlev_rows FROM players WHERE nba_id = 9990001;
