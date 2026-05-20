-- ============================================================
-- NBA Statistics Database — Аналитические функции
-- Файл: 04_functions.sql
-- Описание: Функции расчёта продвинутых метрик NBA
-- ============================================================

-- ============================================================
-- ФУНКЦИЯ: calculate_ts
-- True Shooting Percentage — истинный процент бросков
-- TS% = PTS / (2 × (FGA + 0.44 × FTA))
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_ts(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(5,4)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_pts  NUMERIC := 0;
    v_fga  NUMERIC := 0;
    v_fta  NUMERIC := 0;
    v_denom NUMERIC;
BEGIN
    SELECT
        COALESCE(SUM(gps.points), 0),
        COALESCE(SUM(gps.fga), 0),
        COALESCE(SUM(gps.fta), 0)
    INTO v_pts, v_fga, v_fta
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    -- Нет попыток — метрика неопределена
    IF v_fga = 0 AND v_fta = 0 THEN
        RETURN NULL;
    END IF;

    v_denom := 2.0 * (v_fga + 0.44 * v_fta);

    IF v_denom = 0 THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(v_pts::DECIMAL / v_denom, 4);
END;
$$;

COMMENT ON FUNCTION calculate_ts(INT, INT, INT) IS
    'TS% (True Shooting Percentage) — истинный процент реализации бросков.
     Формула: TS% = PTS / (2 × (FGA + 0.44 × FTA))
     Учитывает ценность трёхочковых и штрафных бросков.
     Элитные снайперы: >0.600. Среднее по лиге: ~0.560.';

-- ============================================================
-- ФУНКЦИЯ: calculate_efg
-- Effective Field Goal Percentage — эффективный процент бросков
-- eFG% = (FGM + 0.5 × FG3M) / FGA
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_efg(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(5,4)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_fgm  NUMERIC := 0;
    v_fg3m NUMERIC := 0;
    v_fga  NUMERIC := 0;
BEGIN
    SELECT
        COALESCE(SUM(gps.fgm), 0),
        COALESCE(SUM(gps.fg3m), 0),
        COALESCE(SUM(gps.fga), 0)
    INTO v_fgm, v_fg3m, v_fga
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    IF v_fga = 0 THEN
        RETURN NULL;
    END IF;

    RETURN ROUND((v_fgm + 0.5 * v_fg3m)::DECIMAL / v_fga, 4);
END;
$$;

COMMENT ON FUNCTION calculate_efg(INT, INT, INT) IS
    'eFG% (Effective Field Goal Percentage) — эффективный процент попаданий.
     Формула: eFG% = (FGM + 0.5 × FG3M) / FGA
     Учитывает повышенную ценность трёхочковых попаданий.
     Элитные бомбардиры: >0.580. Среднее по лиге: ~0.530.';

-- ============================================================
-- ФУНКЦИЯ: calculate_usg
-- Usage Rate — доля 0–1 (как fg_pct / ts_pct в этой БД); на UI ×100 → «USG%»
-- Формула: (FGA + 0.44×FTA + TOV) × TmMP / (MP × (TmFGA + 0.44×TmFTA + TmTOV))
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_usg(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(5,4)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_team_id  INTEGER;
    -- Статистика игрока
    v_fga      NUMERIC := 0;
    v_fta      NUMERIC := 0;
    v_tov      NUMERIC := 0;
    v_mp       NUMERIC := 0;
    -- Статистика команды (только в матчах с этим игроком)
    v_tm_fga   NUMERIC := 0;
    v_tm_fta   NUMERIC := 0;
    v_tm_tov   NUMERIC := 0;
    v_tm_mp    NUMERIC := 0;
    v_denom    NUMERIC;
BEGIN
    IF p_team_id IS NOT NULL THEN
        v_team_id := p_team_id;
    ELSE
        SELECT gps.team_id
        INTO v_team_id
        FROM game_player_stats gps
        JOIN games g ON g.game_id = gps.game_id
        WHERE gps.player_id = p_player_id
          AND g.season_id   = p_season_id
        ORDER BY g.game_date DESC
        LIMIT 1;
    END IF;

    IF v_team_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(gps.fga), 0),
        COALESCE(SUM(gps.fta), 0),
        COALESCE(SUM(gps.turnovers), 0),
        COALESCE(SUM(
            CASE
                WHEN gps.minutes_played IS NOT NULL
                     AND upper(gps.minutes_played::text) <> 'NAN'
                THEN gps.minutes_played
                ELSE 0
            END
        ), 0)
    INTO v_fga, v_fta, v_tov, v_mp
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    IF v_mp < 1 THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(gps2.fga), 0),
        COALESCE(SUM(gps2.fta), 0),
        COALESCE(SUM(gps2.turnovers), 0),
        COALESCE(SUM(
            CASE
                WHEN gps2.minutes_played IS NOT NULL
                     AND upper(gps2.minutes_played::text) <> 'NAN'
                THEN gps2.minutes_played
                ELSE 0
            END
        ), 0)
    INTO v_tm_fga, v_tm_fta, v_tm_tov, v_tm_mp
    FROM game_player_stats gps2
    JOIN games g2 ON g2.game_id = gps2.game_id
    WHERE gps2.team_id  = v_team_id
      AND g2.season_id  = p_season_id
      AND gps2.game_id IN (
          SELECT gps3.game_id
          FROM game_player_stats gps3
          JOIN games g3 ON g3.game_id = gps3.game_id
          WHERE gps3.player_id = p_player_id
            AND g3.season_id = p_season_id
            AND (p_team_id IS NULL OR gps3.team_id = p_team_id)
      );

    v_denom := v_mp * (v_tm_fga + 0.44 * v_tm_fta + v_tm_tov);

    IF v_denom = 0 THEN
        RETURN NULL;
    END IF;

    -- TmMP/5: пять игроков на площадке (определение Basketball-Reference)
    RETURN ROUND(
        (v_fga + 0.44 * v_fta + v_tov) * (v_tm_mp / 5.0) / v_denom,
        4
    );
END;
$$;

COMMENT ON FUNCTION calculate_usg(INT, INT, INT) IS
    'USG (usage rate) — доля 0–1; на экране ×100. Формула: (FGA+0.44*FTA+TOV)*(TmMP/5)/(MP*(TmFGA+0.44*TmFTA+TmTOV)).
     Типично 0.15–0.40; элита >0.32.';

-- ============================================================
-- ФУНКЦИЯ: calculate_per
-- Player Efficiency Rating — рейтинг эффективности игрока
-- Среднее по лиге нормализуется к 15
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_per(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(6,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_pts     NUMERIC := 0;
    v_reb     NUMERIC := 0;
    v_ast     NUMERIC := 0;
    v_stl     NUMERIC := 0;
    v_blk     NUMERIC := 0;
    v_tov     NUMERIC := 0;
    v_fouls   NUMERIC := 0;
    v_fga     NUMERIC := 0;
    v_fgm     NUMERIC := 0;
    v_fta     NUMERIC := 0;
    v_ftm     NUMERIC := 0;
    v_minutes NUMERIC := 0;
    v_uper    NUMERIC;
    v_lg_per  NUMERIC;
BEGIN
    -- Агрегированная статистика игрока за сезон
    SELECT
        COALESCE(SUM(gps.points), 0),
        COALESCE(SUM(gps.rebounds_off + gps.rebounds_def), 0),
        COALESCE(SUM(gps.assists), 0),
        COALESCE(SUM(gps.steals), 0),
        COALESCE(SUM(gps.blocks), 0),
        COALESCE(SUM(gps.turnovers), 0),
        COALESCE(SUM(gps.fouls), 0),
        COALESCE(SUM(gps.fga), 0),
        COALESCE(SUM(gps.fgm), 0),
        COALESCE(SUM(gps.fta), 0),
        COALESCE(SUM(gps.ftm), 0),
        COALESCE(SUM(gps.minutes_played), 0)
    INTO v_pts, v_reb, v_ast, v_stl, v_blk, v_tov, v_fouls,
         v_fga, v_fgm, v_fta, v_ftm, v_minutes
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    -- Минимальная квалификация
    IF v_minutes < 50 THEN
        RETURN NULL;
    END IF;

    -- Расчёт ненормализованного PER (на 48 минут)
    v_uper := (
        v_pts + v_reb + v_ast + v_stl + v_blk
        - v_tov - v_fouls
        - (v_fga - v_fgm)
        - (v_fta - v_ftm) * 0.44
    ) * (48.0 / NULLIF(v_minutes, 0));

    -- Среднее по лиге (квалификация > 100 минут)
    WITH league_uper AS (
        SELECT
            p2.player_id,
            (
                COALESCE(SUM(s2.points), 0)
                + COALESCE(SUM(s2.rebounds_off + s2.rebounds_def), 0)
                + COALESCE(SUM(s2.assists), 0)
                + COALESCE(SUM(s2.steals), 0)
                + COALESCE(SUM(s2.blocks), 0)
                - COALESCE(SUM(s2.turnovers), 0)
                - COALESCE(SUM(s2.fouls), 0)
                - COALESCE(SUM(s2.fga - s2.fgm), 0)
                - COALESCE(SUM(s2.fta - s2.ftm), 0) * 0.44
            ) * 48.0 / NULLIF(SUM(s2.minutes_played), 0) AS uper_val
        FROM game_player_stats s2
        JOIN games g2 ON g2.game_id = s2.game_id
        JOIN players p2 ON p2.player_id = s2.player_id
        WHERE g2.season_id = p_season_id
        GROUP BY p2.player_id
        HAVING SUM(s2.minutes_played) > 100
    )
    SELECT AVG(uper_val) FILTER (WHERE upper(uper_val::text) <> 'NAN')
    INTO v_lg_per
    FROM league_uper;

    IF v_lg_per IS NULL OR v_lg_per = 0 OR upper(v_lg_per::text) = 'NAN' THEN
        v_lg_per := 15.0;
    END IF;

    IF v_uper IS NULL OR upper(v_uper::text) = 'NAN' THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(v_uper * (15.0 / v_lg_per), 2);
END;
$$;

COMMENT ON FUNCTION calculate_per(INT, INT, INT) IS
    'PER (Player Efficiency Rating) — интегральный рейтинг эффективности игрока (формула Холлингера).
     Нормализован: среднее по лиге = 15.
     Интерпретация: >25 MVP-уровень, 20-25 звезда, 13-20 стартёр, <10 запасной.
     Минимальная квалификация: 50 минут за сезон.';

-- ============================================================
-- ФУНКЦИЯ: calculate_bpm
-- Box Plus/Minus — оценка вклада игрока относительно среднего
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_bpm(
    p_player_id INT,
    p_season_id INT,
    p_team_id   INT DEFAULT NULL
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_pts      NUMERIC := 0;
    v_reb      NUMERIC := 0;
    v_ast      NUMERIC := 0;
    v_stl      NUMERIC := 0;
    v_blk      NUMERIC := 0;
    v_tov      NUMERIC := 0;
    v_fouls    NUMERIC := 0;
    v_minutes  NUMERIC := 0;
    v_raw_bpm  NUMERIC;
    v_lg_avg   NUMERIC;
    -- На 100 минут
    v_pts100   NUMERIC;
    v_reb100   NUMERIC;
    v_ast100   NUMERIC;
    v_stl100   NUMERIC;
    v_blk100   NUMERIC;
    v_tov100   NUMERIC;
    v_fouls100 NUMERIC;
BEGIN
    SELECT
        COALESCE(SUM(gps.points), 0),
        COALESCE(SUM(gps.rebounds_off + gps.rebounds_def), 0),
        COALESCE(SUM(gps.assists), 0),
        COALESCE(SUM(gps.steals), 0),
        COALESCE(SUM(gps.blocks), 0),
        COALESCE(SUM(gps.turnovers), 0),
        COALESCE(SUM(gps.fouls), 0),
        COALESCE(SUM(
            CASE
                WHEN gps.minutes_played IS NOT NULL
                     AND upper(gps.minutes_played::text) <> 'NAN'
                THEN gps.minutes_played
                ELSE 0
            END
        ), 0)
    INTO v_pts, v_reb, v_ast, v_stl, v_blk, v_tov, v_fouls, v_minutes
    FROM game_player_stats gps
    JOIN games g ON g.game_id = gps.game_id
    WHERE gps.player_id = p_player_id
      AND g.season_id   = p_season_id
      AND (p_team_id IS NULL OR gps.team_id = p_team_id);

    IF v_minutes < 50 THEN
        RETURN NULL;
    END IF;

    -- Нормализация на 100 минут
    v_pts100   := v_pts   * 100.0 / v_minutes;
    v_reb100   := v_reb   * 100.0 / v_minutes;
    v_ast100   := v_ast   * 100.0 / v_minutes;
    v_stl100   := v_stl   * 100.0 / v_minutes;
    v_blk100   := v_blk   * 100.0 / v_minutes;
    v_tov100   := v_tov   * 100.0 / v_minutes;
    v_fouls100 := v_fouls * 100.0 / v_minutes;

    -- Взвешенный raw BPM
    v_raw_bpm :=
          0.123 * v_pts100
        + 0.234 * v_reb100
        + 0.689 * v_ast100
        + 0.445 * v_stl100
        + 0.407 * v_blk100
        - 0.605 * v_tov100
        - 0.086 * v_fouls100;

    -- Среднее по лиге
    WITH player_totals AS (
        SELECT
            s2.player_id,
            COALESCE(SUM(
                CASE
                    WHEN s2.minutes_played IS NOT NULL
                         AND upper(s2.minutes_played::text) <> 'NAN'
                    THEN s2.minutes_played
                    ELSE 0
                END
            ), 0) AS minutes,
            COALESCE(SUM(s2.points), 0) AS pts,
            COALESCE(SUM(s2.rebounds_off + s2.rebounds_def), 0) AS reb,
            COALESCE(SUM(s2.assists), 0) AS ast,
            COALESCE(SUM(s2.steals), 0) AS stl,
            COALESCE(SUM(s2.blocks), 0) AS blk,
            COALESCE(SUM(s2.turnovers), 0) AS tov,
            COALESCE(SUM(s2.fouls), 0) AS fouls
        FROM game_player_stats s2
        JOIN games g2 ON g2.game_id = s2.game_id
        WHERE g2.season_id = p_season_id
        GROUP BY s2.player_id
        HAVING COALESCE(SUM(
            CASE
                WHEN s2.minutes_played IS NOT NULL
                     AND upper(s2.minutes_played::text) <> 'NAN'
                THEN s2.minutes_played
                ELSE 0
            END
        ), 0) > 100
    ),
    lg AS (
        SELECT
            player_id,
            (
                  0.123 * pts   * 100.0 / NULLIF(minutes, 0)
                + 0.234 * reb   * 100.0 / NULLIF(minutes, 0)
                + 0.689 * ast   * 100.0 / NULLIF(minutes, 0)
                + 0.445 * stl   * 100.0 / NULLIF(minutes, 0)
                + 0.407 * blk   * 100.0 / NULLIF(minutes, 0)
                - 0.605 * tov   * 100.0 / NULLIF(minutes, 0)
                - 0.086 * fouls * 100.0 / NULLIF(minutes, 0)
            ) AS raw
        FROM player_totals
    )
    SELECT AVG(raw) FILTER (WHERE raw IS NOT NULL AND upper(raw::text) <> 'NAN')
    INTO v_lg_avg
    FROM lg;

    IF v_raw_bpm IS NULL OR upper(v_raw_bpm::text) = 'NAN' THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(v_raw_bpm - COALESCE(v_lg_avg, 0), 2);
END;
$$;

COMMENT ON FUNCTION calculate_bpm(INT, INT, INT) IS
    'BPM (Box Plus/Minus) — оценка вклада игрока относительно среднего по лиге.
     Интерпретация: 0 = средний игрок лиги, +5 = MVP-уровень, -5 = слабый резервист.
     Минимальная квалификация: 50 минут за сезон.';

-- ============================================================
-- ПРАВА НА ФУНКЦИИ
-- ============================================================
GRANT EXECUTE ON FUNCTION calculate_ts(INT, INT, INT)  TO analyst;
GRANT EXECUTE ON FUNCTION calculate_efg(INT, INT, INT) TO analyst;
GRANT EXECUTE ON FUNCTION calculate_usg(INT, INT, INT) TO analyst;
GRANT EXECUTE ON FUNCTION calculate_per(INT, INT, INT) TO analyst;
GRANT EXECUTE ON FUNCTION calculate_bpm(INT, INT, INT) TO analyst;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public   TO db_admin;
