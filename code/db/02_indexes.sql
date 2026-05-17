-- ============================================================
-- NBA Statistics Database — Индексы
-- Файл: 02_indexes.sql
-- Описание: шесть индексов по конструкторскому разделу (подраздел indexes)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gps_player_id
    ON game_player_stats(player_id);

CREATE INDEX IF NOT EXISTS idx_gps_team_game
    ON game_player_stats(team_id, game_id);

CREATE INDEX IF NOT EXISTS idx_games_season_id
    ON games(season_id);

CREATE INDEX IF NOT EXISTS idx_games_date
    ON games(game_date);

CREATE INDEX IF NOT EXISTS idx_pss_season
    ON player_season_stats(season_id);

CREATE INDEX IF NOT EXISTS idx_players_name
    ON players(last_name, first_name);

ANALYZE game_player_stats;
ANALYZE player_season_stats;
ANALYZE games;
ANALYZE players;
