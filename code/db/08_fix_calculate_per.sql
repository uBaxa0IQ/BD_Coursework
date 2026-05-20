-- Исправление calculate_per: AVG(uper) не должен включать NaN (иначе весь PER = NaN)

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

    IF v_minutes < 50 THEN
        RETURN NULL;
    END IF;

    v_uper := (
        v_pts + v_reb + v_ast + v_stl + v_blk
        - v_tov - v_fouls
        - (v_fga - v_fgm)
        - (v_fta - v_ftm) * 0.44
    ) * (48.0 / NULLIF(v_minutes, 0));

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
                - (COALESCE(SUM(s2.fga), 0) - COALESCE(SUM(s2.fgm), 0))
                - (COALESCE(SUM(s2.fta), 0) - COALESCE(SUM(s2.ftm), 0)) * 0.44
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
