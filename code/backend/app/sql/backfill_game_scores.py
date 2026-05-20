BACKFILL_GAME_SCORES_SQL = """
UPDATE game_player_stats
SET minutes_played = 0
WHERE minutes_played IS NOT NULL
  AND upper(minutes_played::text) = 'NAN';

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

DO $$
DECLARE
    col text;
BEGIN
    FOR col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'player_season_stats'
          AND data_type = 'numeric'
    LOOP
        EXECUTE format(
            'UPDATE player_season_stats SET %I = NULL '
            'WHERE %I IS NOT NULL AND upper(%I::text) = ''NAN''',
            col, col, col
        );
    END LOOP;
END $$;
"""
