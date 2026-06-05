-- ============================================================
-- ДЕМО (вариант 3): контроль целостности данных
-- Файл: demo_integrity_fail.sql
-- Цель: показать, что БД сама отвергает несогласованные данные.
--
-- Вставляем ЗАВЕРШЁННЫЙ матч, где счёт команды (home_score=99)
-- НЕ равен сумме очков её игроков (Luka набрал 70).
-- Отложенный CONSTRAINT TRIGGER trg_check_team_score (INITIALLY
-- DEFERRED) проверяет согласованность В МОМЕНТ COMMIT и бросает
-- исключение. Транзакция откатывается — в БД ничего не попадает.
--
-- ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ошибка вида
--   ERROR: Player points sum (game_id=..., team_id=14) does not match team score (70 vs 99)
-- ============================================================

\echo '=== Попытка вставить НЕсогласованный матч (счёт 99, а очков 70) ==='
BEGIN;

WITH bad_game AS (
    INSERT INTO games
        (season_id, home_team_id, away_team_id, game_date,
         home_score, away_score, status, overtime)
    VALUES
        (5, 14, 2, DATE '2026-06-07', 99, 30, 'Finished', 0)  -- 99 != 70 !
    RETURNING game_id
)
INSERT INTO game_player_stats
    (game_id, player_id, team_id, minutes_played, points,
     rebounds_def, assists, fgm, fga, fg3m, fg3a, ftm, fta, is_starter)
SELECT g.game_id, v.player_id, v.team_id, v.mp, v.pts,
       v.dreb, v.ast, v.fgm, v.fga, v.fg3m, v.fg3a, v.ftm, v.fta, TRUE
FROM bad_game g,
     (VALUES
        (1155, 14, 42.0, 70, 10, 11, 24, 38, 8, 15, 14, 15),  -- Luka 70 != home_score 99
        ( 563,  2, 38.0, 30,  5,  4, 11, 20, 4,  9,  4,  4)    -- Brown 30 == away_score 30
     ) AS v(player_id, team_id, mp, pts, dreb, ast, fgm, fga, fg3m, fg3a, ftm, fta);

-- Проверка отложена до COMMIT — именно здесь сработает триггер целостности:
COMMIT;

\echo '(если видите эту строку без ошибки — что-то не так с триггером)'
