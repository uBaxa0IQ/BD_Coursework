-- ============================================================
-- ОТКАТ ДЕМОНСТРАЦИОННОЙ ВСТАВКИ
-- Файл: demo_teardown.sql
-- Удаляет демо-матч (CASCADE удалит и game_player_stats),
-- затем вручную пересчитывает сезон, возвращая статистику Луки
-- к исходному состоянию (65 игр). Делает демо повторяемым.
-- ============================================================
BEGIN;

DELETE FROM games
WHERE game_date = DATE '2026-06-04'
  AND home_team_id = 14
  AND away_team_id = 2
  AND season_id = 5;

-- Пересчёт сезона после удаления (триггер срабатывает на INSERT, не на DELETE)
CALL update_season_stats(5);

COMMIT;

\echo '=== После отката: статистика Луки восстановлена ==='
SELECT p.first_name || ' ' || p.last_name AS player,
       pss.games_played AS gp, pss.avg_pts, pss.per
FROM   player_season_stats pss
JOIN   players p ON p.player_id = pss.player_id
WHERE  pss.player_id = 1155 AND pss.season_id = 5;
