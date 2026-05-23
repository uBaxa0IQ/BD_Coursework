-- ============================================================
-- NBA Statistics Database — Процедуры и триггеры
-- Файл: 05_triggers.sql
-- Описание: Автоматический пересчёт сезонной статистики
-- ============================================================

-- ============================================================
-- ПРОЦЕДУРА: update_season_stats
-- Пересчитывает агрегированную статистику за указанный сезон
-- ============================================================
CREATE OR REPLACE PROCEDURE update_season_stats(p_season_id INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO player_season_stats (
        player_id,
        season_id,
        team_id,
        games_played,
        avg_pts,
        avg_reb,
        avg_ast,
        avg_stl,
        avg_blk,
        avg_tov,
        avg_min,
        fg_pct,
        fg3_pct,
        ft_pct,
        avg_plus_minus,
        efg_pct,
        ts_pct,
        usg_pct,
        per,
        bpm
    )
    SELECT
        gps.player_id,
        p_season_id,
        gps.team_id,
        COUNT(DISTINCT gps.game_id),
        ROUND(AVG(gps.points)::DECIMAL, 2),
        ROUND(AVG((gps.rebounds_off + gps.rebounds_def)::DECIMAL), 2),
        ROUND(AVG(gps.assists)::DECIMAL, 2),
        ROUND(AVG(gps.steals)::DECIMAL, 2),
        ROUND(AVG(gps.blocks)::DECIMAL, 2),
        ROUND(AVG(gps.turnovers)::DECIMAL, 2),
        ROUND(AVG(gps.minutes_played)::DECIMAL, 2),
        -- Процент попаданий с игры
        CASE WHEN SUM(gps.fga) > 0
             THEN ROUND(SUM(gps.fgm)::DECIMAL / SUM(gps.fga), 4)
             ELSE NULL END,
        -- Процент трёхочковых
        CASE WHEN SUM(gps.fg3a) > 0
             THEN ROUND(SUM(gps.fg3m)::DECIMAL / SUM(gps.fg3a), 4)
             ELSE NULL END,
        -- Процент штрафных
        CASE WHEN SUM(gps.fta) > 0
             THEN ROUND(SUM(gps.ftm)::DECIMAL / SUM(gps.fta), 4)
             ELSE NULL END,
        ROUND(AVG(gps.plus_minus)::DECIMAL, 2),
        -- Расчётные продвинутые метрики (по отрезку сезона за данную команду)
        calculate_efg(gps.player_id, p_season_id, gps.team_id),
        calculate_ts(gps.player_id, p_season_id, gps.team_id),
        calculate_usg(gps.player_id, p_season_id, gps.team_id),
        calculate_per(gps.player_id, p_season_id, gps.team_id),
        calculate_bpm(gps.player_id, p_season_id, gps.team_id)
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE g.season_id = p_season_id
    GROUP BY gps.player_id, gps.team_id
    HAVING SUM(gps.minutes_played) >= 50
    ON CONFLICT (player_id, season_id, team_id) DO UPDATE SET
        team_id        = EXCLUDED.team_id,
        games_played   = EXCLUDED.games_played,
        avg_pts        = EXCLUDED.avg_pts,
        avg_reb        = EXCLUDED.avg_reb,
        avg_ast        = EXCLUDED.avg_ast,
        avg_stl        = EXCLUDED.avg_stl,
        avg_blk        = EXCLUDED.avg_blk,
        avg_tov        = EXCLUDED.avg_tov,
        avg_min        = EXCLUDED.avg_min,
        fg_pct         = EXCLUDED.fg_pct,
        fg3_pct        = EXCLUDED.fg3_pct,
        ft_pct         = EXCLUDED.ft_pct,
        avg_plus_minus = EXCLUDED.avg_plus_minus,
        efg_pct        = EXCLUDED.efg_pct,
        ts_pct         = EXCLUDED.ts_pct,
        usg_pct        = EXCLUDED.usg_pct,
        per            = EXCLUDED.per,
        bpm            = EXCLUDED.bpm;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Удалить строки игроков, не прошедших квалификацию (≥50 мин)
    DELETE FROM player_season_stats pss
    WHERE pss.season_id = p_season_id
      AND NOT EXISTS (
          SELECT 1
          FROM game_player_stats gps
          JOIN games g ON g.game_id = gps.game_id
          WHERE g.season_id = p_season_id
            AND gps.player_id = pss.player_id
            AND gps.team_id = pss.team_id
          GROUP BY gps.player_id, gps.team_id
          HAVING SUM(gps.minutes_played) >= 50
      );

    RAISE NOTICE 'Обновлена статистика за сезон %: % игроков', p_season_id, v_count;
END;
$$;

COMMENT ON PROCEDURE update_season_stats(INT) IS
    'Процедура пересчёта агрегированной статистики игроков за указанный сезон.
     Вызывается автоматически триггером или вручную после bulk-загрузки данных.
     Минимальная квалификация для попадания в агрегат: 50 минут за сезон.';

-- ============================================================
-- ФУНКЦИЯ-ТРИГГЕР: trg_update_season_stats_func
-- Автоматически пересчитывает статистику при вставке данных
-- ============================================================
CREATE OR REPLACE FUNCTION trg_update_season_stats_func()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_season_id INT;
BEGIN
    FOR v_season_id IN
        SELECT DISTINCT g.season_id
        FROM inserted_rows r
        JOIN games g ON r.game_id = g.game_id
    LOOP
        CALL update_season_stats(v_season_id);
    END LOOP;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION trg_update_season_stats_func() IS
    'Функция-триггер для автоматического пересчёта сезонной статистики.
     Использует переходную таблицу inserted_rows (REFERENCING NEW TABLE).';

-- ============================================================
-- ТРИГГЕР: trigger_update_season_stats
-- FOR EACH STATEMENT + переходная таблица inserted_rows
-- ============================================================
DROP TRIGGER IF EXISTS trigger_update_season_stats ON game_player_stats;
DROP TRIGGER IF EXISTS after_game_player_stats_insert ON game_player_stats;
DROP FUNCTION IF EXISTS trigger_update_season_stats();
DROP FUNCTION IF EXISTS trg_update_season_stats_func();

CREATE TRIGGER trigger_update_season_stats
    AFTER INSERT ON game_player_stats
    REFERENCING NEW TABLE AS inserted_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION trg_update_season_stats_func();

COMMENT ON TRIGGER trigger_update_season_stats ON game_player_stats IS
    'Триггер автопересчёта сезонной статистики после вставки данных матча.
     Переходная таблица inserted_rows позволяет обработать все season_id пакета.';

-- ============================================================
-- ТРИГГЕР: trg_check_team_score
-- Проверка равенства суммы очков игроков командному счёту матча
-- ============================================================
CREATE OR REPLACE FUNCTION trg_validate_team_score_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_id   INTEGER;
    v_status    VARCHAR(12);
    v_home_id   INTEGER;
    v_away_id   INTEGER;
    v_home_score SMALLINT;
    v_away_score SMALLINT;
    rec         RECORD;
    v_sum       INTEGER;
    v_expected  INTEGER;
BEGIN
    v_game_id := COALESCE(NEW.game_id, OLD.game_id);

    SELECT status, home_team_id, away_team_id, home_score, away_score
    INTO v_status, v_home_id, v_away_id, v_home_score, v_away_score
    FROM games
    WHERE game_id = v_game_id;

    IF v_status IS DISTINCT FROM 'Finished'
       OR v_home_score IS NULL
       OR v_away_score IS NULL
    THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    FOR rec IN
        SELECT DISTINCT team_id
        FROM game_player_stats
        WHERE game_id = v_game_id
    LOOP
        SELECT COALESCE(SUM(points), 0)::INTEGER
        INTO v_sum
        FROM game_player_stats
        WHERE game_id = v_game_id
          AND team_id = rec.team_id;

        v_expected := CASE
            WHEN rec.team_id = v_home_id THEN v_home_score
            WHEN rec.team_id = v_away_id THEN v_away_score
            ELSE NULL
        END;

        IF v_expected IS NOT NULL AND v_sum <> v_expected THEN
            RAISE EXCEPTION
                'Player points sum (game_id=%, team_id=%) does not match team score (% vs %)',
                v_game_id, rec.team_id, v_sum, v_expected;
        END IF;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_check_team_score ON game_player_stats;

CREATE CONSTRAINT TRIGGER trg_check_team_score
    AFTER INSERT OR UPDATE ON game_player_stats
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_validate_team_score_row();

COMMENT ON TRIGGER trg_check_team_score ON game_player_stats IS
    'Отложенная проверка равенства суммы очков игроков командному счёту
     для завершённых матчей (валидация на COMMIT).';

-- ============================================================
-- ПРИМЕЧАНИЕ: управление триггером при bulk-загрузке
-- ============================================================
-- Перед массовой загрузкой данных отключить триггеры:
--   ALTER TABLE game_player_stats DISABLE TRIGGER ALL;
--   (отключает trigger_update_season_stats и trg_check_team_score)
--
-- После загрузки включить и пересчитать вручную:
--   ALTER TABLE game_player_stats ENABLE TRIGGER ALL;
--   CALL update_season_stats(1);  -- для каждого season_id
--   CALL update_season_stats(2);
--   CALL update_season_stats(3);
--   CALL update_season_stats(4);
--   CALL update_season_stats(5);
