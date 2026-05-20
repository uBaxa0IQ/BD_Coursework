-- NBA API иногда отдаёт MIN = NaN (DNP); float('nan') попадал в minutes_played.
-- NaN в SUM отравляет USG% и BPM (команда/лига).

UPDATE game_player_stats
SET minutes_played = 0
WHERE minutes_played IS NOT NULL
  AND upper(minutes_played::text) = 'NAN';
