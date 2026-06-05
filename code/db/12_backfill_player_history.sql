-- ============================================================
-- NBA Statistics Database — Дозаполнение истории выступлений
-- Файл: 12_backfill_player_history.sql
-- Описание: Выводит start_date / end_date / contract_type для
--           player_team_history из фактических данных матчей
--           (game_player_stats + games). NBA API тип контракта и
--           даты сделок не отдаёт, поэтому значения реконструируются:
--             • start_date  — дата первого матча игрока за команду в сезоне;
--             • end_date    — дата последнего матча за эту команду, ЕСЛИ
--                             позже в сезоне игрок играл за другую команду
--                             (обмен по ходу сезона); иначе NULL (ещё в составе);
--             • contract_type — эвристика по объёму участия за стинт.
--
-- ВАЖНО: запускать ПОСЛЕ загрузки данных матчей (на пустой БД no-op).
-- Идемпотентно — можно прогонять повторно.
-- ============================================================

WITH stint AS (
    SELECT
        gps.player_id,
        g.season_id,
        gps.team_id,
        MIN(g.game_date)              AS first_date,
        MAX(g.game_date)              AS last_date,
        COUNT(DISTINCT g.game_id)     AS gp,
        COALESCE(SUM(gps.minutes_played), 0) AS mins
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    GROUP BY gps.player_id, g.season_id, gps.team_id
),
player_last AS (
    -- дата последнего матча игрока в сезоне (по всем командам)
    SELECT player_id, season_id, MAX(last_date) AS player_last_date
    FROM stint
    GROUP BY player_id, season_id
)
UPDATE player_team_history pth
SET
    start_date    = s.first_date,
    end_date      = CASE
                        WHEN s.last_date < pl.player_last_date THEN s.last_date
                        ELSE NULL
                    END,
    contract_type = CASE
                        WHEN s.gp <= 3              THEN '10-Day'
                        WHEN s.gp < 15 OR s.mins < 250 THEN 'Two-Way'
                        ELSE 'Standard'
                    END
FROM stint s
JOIN player_last pl
    ON pl.player_id = s.player_id
   AND pl.season_id = s.season_id
WHERE pth.player_id = s.player_id
  AND pth.season_id = s.season_id
  AND pth.team_id   = s.team_id;

-- Контроль распределения после дозаполнения
\echo '=== Распределение типов контракта ==='
SELECT contract_type, COUNT(*) FROM player_team_history GROUP BY 1 ORDER BY 2 DESC;
\echo '=== Записей с датой окончания (обмены по ходу сезона) ==='
SELECT COUNT(*) AS with_end_date FROM player_team_history WHERE end_date IS NOT NULL;
