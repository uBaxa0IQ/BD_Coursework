-- ============================================================
-- ДЕМО (вариант 2): добавление НОВОГО игрока — полный pipeline
-- Файл: demo_new_player.sql
-- Цель: показать сквозной путь — вставка игрока в справочник,
--       вставка его матчей, автоматическое создание агрегата
--       player_season_stats триггером и появление игрока в UI.
--
-- Почему 2 матча: процедура update_season_stats() включает игрока
-- в агрегат только при SUM(minutes_played) >= 50 за сезон.
-- Один матч (<=48 мин) квалификацию не проходит.
-- ============================================================

\echo '=== Шаг 1. Добавляем вымышленного игрока в справочник players ==='
INSERT INTO players
    (nba_id, first_name, last_name, birth_date, nationality,
     height_cm, weight_kg, position_id, jersey_number,
     is_active, draft_year, draft_round, draft_pick)
VALUES
    (9990001, 'Ivan', 'Zhuravlev', DATE '2002-03-15', 'Russia',
     198, 92, 1, 7, TRUE, 2024, 1, 5)
ON CONFLICT (nba_id) DO NOTHING;

SELECT player_id, first_name, last_name, nba_id
FROM   players WHERE nba_id = 9990001;

\echo ''
\echo '=== Шаг 2. Два матча игрока за LAL (триггер сработает на вставке статистики) ==='
-- Оба матча и вся статистика — в одной транзакции.
-- INSERT в game_player_stats — один оператор (CTE+VALUES) => триггер
-- FOR EACH STATEMENT выполняется один раз и пересчитывает сезон 5.
BEGIN;

WITH ng AS (
    INSERT INTO games
        (season_id, home_team_id, away_team_id, game_date,
         home_score, away_score, status, overtime)
    VALUES
        (5, 14, 2, DATE '2026-06-05', 30, 28, 'Finished', 0),  -- LAL vs BOS
        (5, 14, 2, DATE '2026-06-06', 26, 31, 'Finished', 0)   -- LAL vs BOS
    RETURNING game_id, game_date
)
INSERT INTO game_player_stats
    (game_id, player_id, team_id, minutes_played, points,
     rebounds_off, rebounds_def, assists, steals, blocks, turnovers, fouls,
     fgm, fga, fg3m, fg3a, ftm, fta, plus_minus, is_starter)
SELECT ng.game_id,
       v.player_id, v.team_id, v.mp, v.pts,
       v.oreb, v.dreb, v.ast, v.stl, v.blk, v.tov, v.pf,
       v.fgm, v.fga, v.fg3m, v.fg3a, v.ftm, v.fta, v.pm, TRUE
FROM ng
JOIN (VALUES
        -- матч 05.06: Иван 30 очк (LAL), Brown 28 очк (BOS)
        (DATE '2026-06-05', (SELECT player_id FROM players WHERE nba_id=9990001), 14, 32.0, 30, 2, 5, 6, 1, 0, 2, 2, 11, 21, 4, 10, 4, 5,  2),
        (DATE '2026-06-05', 563,  2, 30.0, 28, 1, 5, 4, 1, 0, 3, 3, 10, 19, 4,  9, 4, 4, -2),
        -- матч 06.06: Иван 26 очк (LAL), Brown 31 очк (BOS)
        (DATE '2026-06-06', (SELECT player_id FROM players WHERE nba_id=9990001), 14, 30.0, 26, 1, 6, 5, 2, 1, 1, 2, 10, 19, 3,  8, 3, 4, -5),
        (DATE '2026-06-06', 563,  2, 34.0, 31, 0, 6, 3, 1, 0, 2, 1, 11, 20, 5, 10, 4, 4,  5)
     ) AS v(game_date, player_id, team_id, mp, pts, oreb, dreb, ast, stl, blk, tov, pf,
            fgm, fga, fg3m, fg3a, ftm, fta, pm)
  ON v.game_date = ng.game_date;

COMMIT;

\echo ''
\echo '=== Шаг 3. Агрегат создан триггером автоматически ==='
SELECT p.first_name || ' ' || p.last_name AS player,
       t.abbreviation AS team,
       pss.games_played AS gp,
       pss.avg_pts, pss.avg_reb, pss.avg_ast,
       pss.fg_pct, pss.ts_pct, pss.per
FROM   player_season_stats pss
JOIN   players p ON p.player_id = pss.player_id
JOIN   teams   t ON t.team_id   = pss.team_id
WHERE  p.nba_id = 9990001 AND pss.season_id = 5;

\echo ''
\echo 'Теперь в UI: localhost:3000/players  -> поиск "Zhuravlev"'
\echo '(не забудь сбросить кэш: POST /admin/refresh/5)'
