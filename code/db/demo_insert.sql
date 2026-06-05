-- ============================================================
-- ДЕМОНСТРАЦИОННАЯ ВСТАВКА ДЛЯ ЗАЩИТЫ
-- Файл: demo_insert.sql
-- Цель: показать автоматический пересчёт сезонной статистики
--       и продвинутых метрик (PER, TS%, eFG%, USG%, BPM)
--       триггером trigger_update_season_stats при вставке матча,
--       а также его отражение в пользовательском интерфейсе.
--
-- Сценарий: добавляем "monster game" Луки Дончича (LAL) в сезоне
--           2025-26 — 70 очков и трипл-дабл — и наблюдаем, как
--           автоматически меняются его средние и рейтинг PER.
--
-- Запуск:
--   docker compose exec -T postgres psql -U nba_admin -d nba_stats -f /demo/demo_insert.sql
--   (см. README_DEMO.md — как смонтировать файл или запустить через stdin)
-- ============================================================

\echo '=== ДО ВСТАВКИ: сезонная статистика Луки Дончича (season 2025-26) ==='
SELECT p.first_name || ' ' || p.last_name AS player,
       t.abbreviation AS team,
       pss.games_played AS gp,
       pss.avg_pts, pss.avg_reb, pss.avg_ast,
       pss.ts_pct, pss.per
FROM   player_season_stats pss
JOIN   players p ON p.player_id = pss.player_id
JOIN   teams   t ON t.team_id   = pss.team_id
WHERE  pss.player_id = 1155 AND pss.season_id = 5;

-- ============================================================
-- ВСТАВКА: новый завершённый матч LAL vs BOS (04.06.2026)
-- + статистика игроков. Всё в одной транзакции.
-- INSERT в game_player_stats — ОДИН оператор (CTE + VALUES),
-- поэтому FOR EACH STATEMENT-триггер срабатывает один раз и
-- пересчитывает весь сезон 5 автоматически.
-- Счёт команд = очкам единственного игрока команды, чтобы
-- прошла отложенная проверка целостности trg_check_team_score.
-- ============================================================
BEGIN;

WITH new_game AS (
    INSERT INTO games
        (season_id, home_team_id, away_team_id, game_date,
         home_score, away_score, status, overtime)
    VALUES
        (5, 14, 2, DATE '2026-06-04', 70, 30, 'Finished', 0)
    RETURNING game_id
)
INSERT INTO game_player_stats
    (game_id, player_id, team_id, minutes_played, points,
     rebounds_off, rebounds_def, assists, steals, blocks, turnovers, fouls,
     fgm, fga, fg3m, fg3a, ftm, fta, plus_minus, is_starter)
SELECT g.game_id, v.player_id, v.team_id, v.mp, v.pts,
       v.oreb, v.dreb, v.ast, v.stl, v.blk, v.tov, v.pf,
       v.fgm, v.fga, v.fg3m, v.fg3a, v.ftm, v.fta, v.pm, TRUE
FROM new_game g,
     (VALUES
        -- Luka Dončić (LAL): 70 очк (24/38 FG, 8 трёхо., 14/15 FT), 12 подб, 11 пер
        (1155, 14, 42.0, 70, 2, 10, 11, 2, 1, 4, 2, 24, 38, 8, 15, 14, 15, 25),
        -- Jaylen Brown (BOS): 30 очк (11/20 FG, 4 трёхо., 4/4 FT)
        ( 563,  2, 38.0, 30, 1,  5,  4, 1, 0, 3, 3, 11, 20, 4,  9,  4,  4, -25)
     ) AS v(player_id, team_id, mp, pts, oreb, dreb, ast, stl, blk, tov, pf,
            fgm, fga, fg3m, fg3a, ftm, fta, pm);

COMMIT;

\echo ''
\echo '=== ПОСЛЕ ВСТАВКИ: статистика пересчитана триггером автоматически ==='
SELECT p.first_name || ' ' || p.last_name AS player,
       t.abbreviation AS team,
       pss.games_played AS gp,
       pss.avg_pts, pss.avg_reb, pss.avg_ast,
       pss.ts_pct, pss.per
FROM   player_season_stats pss
JOIN   players p ON p.player_id = pss.player_id
JOIN   teams   t ON t.team_id   = pss.team_id
WHERE  pss.player_id = 1155 AND pss.season_id = 5;

\echo ''
\echo '=== Контроль: вставленный матч и строки статистики ==='
SELECT g.game_id, g.game_date, ht.abbreviation AS home, g.home_score,
       at.abbreviation AS away, g.away_score, g.status
FROM   games g
JOIN   teams ht ON ht.team_id = g.home_team_id
JOIN   teams at ON at.team_id = g.away_team_id
WHERE  g.game_date = DATE '2026-06-04' AND g.home_team_id = 14 AND g.away_team_id = 2;
