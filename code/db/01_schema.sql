-- ============================================================
-- NBA Statistics Database — Схема базы данных
-- Файл: 01_schema.sql
-- Описание: Создание всех таблиц для хранения статистики NBA
-- ============================================================

-- Удаление таблиц в правильном порядке (с учётом FK)
DROP TABLE IF EXISTS player_team_history CASCADE;
DROP TABLE IF EXISTS player_season_stats CASCADE;
DROP TABLE IF EXISTS game_player_stats CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS positions CASCADE;

-- ============================================================
-- 1. СПРАВОЧНИК ПОЗИЦИЙ
-- ============================================================
CREATE TABLE IF NOT EXISTS positions (
    position_id SERIAL PRIMARY KEY,
    code        VARCHAR(2)  NOT NULL UNIQUE,
    name        VARCHAR(20) NOT NULL
);

COMMENT ON TABLE positions IS 'Справочник позиций игроков NBA';
COMMENT ON COLUMN positions.position_id IS 'Уникальный идентификатор позиции';
COMMENT ON COLUMN positions.code IS 'Краткое обозначение позиции (PG, SG, SF, PF, C)';
COMMENT ON COLUMN positions.name IS 'Полное название позиции';

INSERT INTO positions (code, name) VALUES
    ('PG', 'Point Guard'),
    ('SG', 'Shooting Guard'),
    ('SF', 'Small Forward'),
    ('PF', 'Power Forward'),
    ('C',  'Center')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. СПРАВОЧНИК СЕЗОНОВ
-- ============================================================
CREATE TABLE IF NOT EXISTS seasons (
    season_id   SERIAL PRIMARY KEY,
    label       VARCHAR(9)  NOT NULL UNIQUE,
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    season_type VARCHAR(15) NOT NULL DEFAULT 'Regular'
        CHECK (season_type IN ('Regular', 'Playoff', 'Preseason'))
);

COMMENT ON TABLE seasons IS 'Справочник сезонов NBA';
COMMENT ON COLUMN seasons.season_id IS 'Уникальный идентификатор сезона';
COMMENT ON COLUMN seasons.label IS 'Метка сезона в формате ГГГГ-ГГ (например, 2023-24)';
COMMENT ON COLUMN seasons.start_date IS 'Дата начала сезона';
COMMENT ON COLUMN seasons.end_date IS 'Дата окончания сезона';
COMMENT ON COLUMN seasons.season_type IS 'Тип сезона: Regular (регулярный), Playoff (плей-офф), Preseason (предсезонный)';

INSERT INTO seasons (label, start_date, end_date, season_type) VALUES
    ('2019-20', '2019-10-22', '2020-10-11', 'Regular'),
    ('2020-21', '2020-12-22', '2021-07-20', 'Regular'),
    ('2021-22', '2021-10-19', '2022-06-16', 'Regular'),
    ('2022-23', '2022-10-18', '2023-06-12', 'Regular'),
    ('2023-24', '2023-10-24', '2024-06-17', 'Regular')
ON CONFLICT (label) DO NOTHING;

-- ============================================================
-- 3. КОМАНДЫ NBA
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
    team_id      SERIAL PRIMARY KEY,
    nba_team_id  INTEGER     NOT NULL UNIQUE,
    name         VARCHAR(60) NOT NULL UNIQUE,
    abbreviation CHAR(3)     NOT NULL UNIQUE,
    city         VARCHAR(50) NOT NULL,
    conference   VARCHAR(4)  NOT NULL CHECK (conference IN ('East', 'West')),
    division     VARCHAR(20) NOT NULL,
    arena_name   VARCHAR(80),
    founded_year SMALLINT    CHECK (founded_year BETWEEN 1920 AND 2100),
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE teams IS 'Команды NBA';
COMMENT ON COLUMN teams.team_id IS 'Уникальный идентификатор команды в системе';
COMMENT ON COLUMN teams.nba_team_id IS 'Идентификатор команды на NBA.com (для CDN логотипов)';
COMMENT ON COLUMN teams.name IS 'Полное название команды';
COMMENT ON COLUMN teams.abbreviation IS 'Аббревиатура команды (3 буквы)';
COMMENT ON COLUMN teams.city IS 'Город базирования команды';
COMMENT ON COLUMN teams.conference IS 'Конференция: East (Восток) или West (Запад)';
COMMENT ON COLUMN teams.division IS 'Дивизион команды';
COMMENT ON COLUMN teams.arena_name IS 'Название домашней арены';
COMMENT ON COLUMN teams.founded_year IS 'Год основания команды';
COMMENT ON COLUMN teams.is_active IS 'Признак активной команды';

INSERT INTO teams (nba_team_id, name, abbreviation, city, conference, division, arena_name, founded_year) VALUES
    (1610612737, 'Atlanta Hawks',          'ATL', 'Atlanta',        'East', 'Southeast', 'State Farm Arena',              1946),
    (1610612738, 'Boston Celtics',         'BOS', 'Boston',         'East', 'Atlantic',  'TD Garden',                     1946),
    (1610612751, 'Brooklyn Nets',          'BKN', 'Brooklyn',       'East', 'Atlantic',  'Barclays Center',               1967),
    (1610612766, 'Charlotte Hornets',      'CHA', 'Charlotte',      'East', 'Southeast', 'Spectrum Center',               1988),
    (1610612741, 'Chicago Bulls',          'CHI', 'Chicago',        'East', 'Central',   'United Center',                 1966),
    (1610612739, 'Cleveland Cavaliers',    'CLE', 'Cleveland',      'East', 'Central',   'Rocket Mortgage FieldHouse',    1970),
    (1610612742, 'Dallas Mavericks',       'DAL', 'Dallas',         'West', 'Southwest', 'American Airlines Center',      1980),
    (1610612743, 'Denver Nuggets',         'DEN', 'Denver',         'West', 'Northwest', 'Ball Arena',                    1967),
    (1610612765, 'Detroit Pistons',        'DET', 'Detroit',        'East', 'Central',   'Little Caesars Arena',          1941),
    (1610612744, 'Golden State Warriors',  'GSW', 'San Francisco',  'West', 'Pacific',   'Chase Center',                  1946),
    (1610612745, 'Houston Rockets',        'HOU', 'Houston',        'West', 'Southwest', 'Toyota Center',                 1967),
    (1610612754, 'Indiana Pacers',         'IND', 'Indianapolis',   'East', 'Central',   'Gainbridge Fieldhouse',         1967),
    (1610612746, 'LA Clippers',            'LAC', 'Los Angeles',    'West', 'Pacific',   'Crypto.com Arena',              1970),
    (1610612747, 'Los Angeles Lakers',     'LAL', 'Los Angeles',    'West', 'Pacific',   'Crypto.com Arena',              1947),
    (1610612763, 'Memphis Grizzlies',      'MEM', 'Memphis',        'West', 'Southwest', 'FedExForum',                    1995),
    (1610612748, 'Miami Heat',             'MIA', 'Miami',          'East', 'Southeast', 'Kaseya Center',                 1988),
    (1610612749, 'Milwaukee Bucks',        'MIL', 'Milwaukee',      'East', 'Central',   'Fiserv Forum',                  1968),
    (1610612750, 'Minnesota Timberwolves', 'MIN', 'Minneapolis',    'West', 'Northwest', 'Target Center',                 1989),
    (1610612740, 'New Orleans Pelicans',   'NOP', 'New Orleans',    'West', 'Southwest', 'Smoothie King Center',          2002),
    (1610612752, 'New York Knicks',        'NYK', 'New York',       'East', 'Atlantic',  'Madison Square Garden',         1946),
    (1610612760, 'Oklahoma City Thunder',  'OKC', 'Oklahoma City',  'West', 'Northwest', 'Paycom Center',                 1967),
    (1610612753, 'Orlando Magic',          'ORL', 'Orlando',        'East', 'Southeast', 'Kia Center',                    1989),
    (1610612755, 'Philadelphia 76ers',     'PHI', 'Philadelphia',   'East', 'Atlantic',  'Wells Fargo Center',            1946),
    (1610612756, 'Phoenix Suns',           'PHX', 'Phoenix',        'West', 'Pacific',   'Footprint Center',              1968),
    (1610612757, 'Portland Trail Blazers', 'POR', 'Portland',       'West', 'Northwest', 'Moda Center',                   1970),
    (1610612758, 'Sacramento Kings',       'SAC', 'Sacramento',     'West', 'Pacific',   'Golden 1 Center',               1945),
    (1610612759, 'San Antonio Spurs',      'SAS', 'San Antonio',    'West', 'Southwest', 'AT&T Center',                   1967),
    (1610612761, 'Toronto Raptors',        'TOR', 'Toronto',        'East', 'Atlantic',  'Scotiabank Arena',              1995),
    (1610612762, 'Utah Jazz',              'UTA', 'Salt Lake City', 'West', 'Northwest', 'Delta Center',                  1974),
    (1610612764, 'Washington Wizards',     'WAS', 'Washington',     'East', 'Southeast', 'Capital One Arena',             1961)
ON CONFLICT (nba_team_id) DO NOTHING;

-- ============================================================
-- 4. ИГРОКИ NBA
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
    player_id    SERIAL PRIMARY KEY,
    nba_id       INTEGER     NOT NULL UNIQUE,
    first_name   VARCHAR(50) NOT NULL,
    last_name    VARCHAR(50) NOT NULL,
    birth_date   DATE,
    nationality  VARCHAR(50),
    height_cm    SMALLINT    CHECK (height_cm BETWEEN 150 AND 250),
    weight_kg    SMALLINT    CHECK (weight_kg BETWEEN 60 AND 200),
    position_id  INTEGER     REFERENCES positions(position_id),
    jersey_number SMALLINT   CHECK (jersey_number BETWEEN 0 AND 99),
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    draft_year   SMALLINT,
    draft_round  SMALLINT    CHECK (draft_round IN (1, 2)),
    draft_pick   SMALLINT    CHECK (draft_pick BETWEEN 1 AND 30)
);

COMMENT ON TABLE players IS 'Игроки NBA';
COMMENT ON COLUMN players.player_id IS 'Уникальный идентификатор игрока в системе';
COMMENT ON COLUMN players.nba_id IS 'Идентификатор игрока на NBA.com (для CDN фотографий)';
COMMENT ON COLUMN players.first_name IS 'Имя игрока';
COMMENT ON COLUMN players.last_name IS 'Фамилия игрока';
COMMENT ON COLUMN players.birth_date IS 'Дата рождения';
COMMENT ON COLUMN players.nationality IS 'Гражданство';
COMMENT ON COLUMN players.height_cm IS 'Рост в сантиметрах';
COMMENT ON COLUMN players.weight_kg IS 'Вес в килограммах';
COMMENT ON COLUMN players.position_id IS 'Ссылка на позицию игрока';
COMMENT ON COLUMN players.jersey_number IS 'Номер футболки';
COMMENT ON COLUMN players.is_active IS 'Признак действующего игрока';
COMMENT ON COLUMN players.draft_year IS 'Год драфта';
COMMENT ON COLUMN players.draft_round IS 'Раунд драфта (1 или 2)';
COMMENT ON COLUMN players.draft_pick IS 'Номер выбора на драфте';

-- ============================================================
-- 5. МАТЧИ
-- ============================================================
CREATE TABLE IF NOT EXISTS games (
    game_id      SERIAL PRIMARY KEY,
    season_id    INTEGER     NOT NULL REFERENCES seasons(season_id),
    home_team_id INTEGER     NOT NULL REFERENCES teams(team_id),
    away_team_id INTEGER     NOT NULL REFERENCES teams(team_id),
    game_date    DATE        NOT NULL,
    home_score   SMALLINT    CHECK (home_score >= 0),
    away_score   SMALLINT    CHECK (away_score >= 0),
    status       VARCHAR(12) NOT NULL DEFAULT 'Scheduled'
        CHECK (status IN ('Finished', 'Scheduled', 'Postponed')),
    overtime     SMALLINT    NOT NULL DEFAULT 0 CHECK (overtime BETWEEN 0 AND 6),
    CONSTRAINT chk_different_teams CHECK (home_team_id <> away_team_id)
);

COMMENT ON TABLE games IS 'Матчи NBA';
COMMENT ON COLUMN games.game_id IS 'Уникальный идентификатор матча';
COMMENT ON COLUMN games.season_id IS 'Ссылка на сезон';
COMMENT ON COLUMN games.home_team_id IS 'Ссылка на команду хозяев';
COMMENT ON COLUMN games.away_team_id IS 'Ссылка на команду гостей';
COMMENT ON COLUMN games.game_date IS 'Дата проведения матча';
COMMENT ON COLUMN games.home_score IS 'Счёт команды хозяев';
COMMENT ON COLUMN games.away_score IS 'Счёт команды гостей';
COMMENT ON COLUMN games.status IS 'Статус матча: Finished (завершён), Scheduled (запланирован), Postponed (перенесён)';
COMMENT ON COLUMN games.overtime IS 'Количество овертаймов (0 = без овертаймов)';

-- ============================================================
-- 6. СТАТИСТИКА ИГРОКОВ ЗА МАТЧ (главная таблица, ~200 000 строк)
-- ============================================================
CREATE TABLE IF NOT EXISTS game_player_stats (
    stat_id       SERIAL PRIMARY KEY,
    game_id       INTEGER      NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id     INTEGER      NOT NULL REFERENCES players(player_id) ON DELETE RESTRICT,
    team_id       INTEGER      NOT NULL REFERENCES teams(team_id) ON DELETE RESTRICT,
    minutes_played DECIMAL(4,1) CHECK (minutes_played >= 0),
    points        SMALLINT     NOT NULL DEFAULT 0 CHECK (points >= 0),
    rebounds_off  SMALLINT     NOT NULL DEFAULT 0 CHECK (rebounds_off >= 0),
    rebounds_def  SMALLINT     NOT NULL DEFAULT 0 CHECK (rebounds_def >= 0),
    assists       SMALLINT     NOT NULL DEFAULT 0 CHECK (assists >= 0),
    steals        SMALLINT     NOT NULL DEFAULT 0 CHECK (steals >= 0),
    blocks        SMALLINT     NOT NULL DEFAULT 0 CHECK (blocks >= 0),
    turnovers     SMALLINT     NOT NULL DEFAULT 0 CHECK (turnovers >= 0),
    fouls         SMALLINT     NOT NULL DEFAULT 0 CHECK (fouls BETWEEN 0 AND 6),
    fgm           SMALLINT     NOT NULL DEFAULT 0 CHECK (fgm >= 0),
    fga           SMALLINT     NOT NULL DEFAULT 0 CHECK (fga >= 0),
    fg3m          SMALLINT     NOT NULL DEFAULT 0 CHECK (fg3m >= 0),
    fg3a          SMALLINT     NOT NULL DEFAULT 0 CHECK (fg3a >= 0),
    ftm           SMALLINT     NOT NULL DEFAULT 0 CHECK (ftm >= 0),
    fta           SMALLINT     NOT NULL DEFAULT 0 CHECK (fta >= 0),
    plus_minus    SMALLINT,
    is_starter    BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_game_player UNIQUE (game_id, player_id),
    CONSTRAINT chk_fgm_fga    CHECK (fgm <= fga),
    CONSTRAINT chk_fg3m_fg3a  CHECK (fg3m <= fg3a),
    CONSTRAINT chk_fg3a_fga   CHECK (fg3a <= fga),
    CONSTRAINT chk_ftm_fta    CHECK (ftm <= fta),
    CONSTRAINT chk_fg3m_fgm   CHECK (fg3m <= fgm)
);

COMMENT ON TABLE game_player_stats IS 'Статистика игроков за отдельный матч (главная таблица, ~200 000 строк)';
COMMENT ON COLUMN game_player_stats.stat_id IS 'Уникальный идентификатор записи статистики';
COMMENT ON COLUMN game_player_stats.game_id IS 'Ссылка на матч';
COMMENT ON COLUMN game_player_stats.player_id IS 'Ссылка на игрока';
COMMENT ON COLUMN game_player_stats.team_id IS 'Ссылка на команду игрока в данном матче';
COMMENT ON COLUMN game_player_stats.minutes_played IS 'Сыгранное время в минутах';
COMMENT ON COLUMN game_player_stats.points IS 'Набранные очки';
COMMENT ON COLUMN game_player_stats.rebounds_off IS 'Подборы в нападении';
COMMENT ON COLUMN game_player_stats.rebounds_def IS 'Подборы в защите';
COMMENT ON COLUMN game_player_stats.assists IS 'Результативные передачи';
COMMENT ON COLUMN game_player_stats.steals IS 'Перехваты';
COMMENT ON COLUMN game_player_stats.blocks IS 'Блок-шоты';
COMMENT ON COLUMN game_player_stats.turnovers IS 'Потери мяча';
COMMENT ON COLUMN game_player_stats.fouls IS 'Персональные фолы';
COMMENT ON COLUMN game_player_stats.fgm IS 'Попадания с игры';
COMMENT ON COLUMN game_player_stats.fga IS 'Попытки с игры';
COMMENT ON COLUMN game_player_stats.fg3m IS 'Попадания с трёхочковой дистанции';
COMMENT ON COLUMN game_player_stats.fg3a IS 'Попытки с трёхочковой дистанции';
COMMENT ON COLUMN game_player_stats.ftm IS 'Попадания штрафных бросков';
COMMENT ON COLUMN game_player_stats.fta IS 'Попытки штрафных бросков';
COMMENT ON COLUMN game_player_stats.plus_minus IS 'Показатель плюс-минус за матч';
COMMENT ON COLUMN game_player_stats.is_starter IS 'Признак стартового игрока';

-- ============================================================
-- 7. АГРЕГИРОВАННАЯ СТАТИСТИКА ЗА СЕЗОН (~3000 строк)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_season_stats (
    pss_id          SERIAL PRIMARY KEY,
    player_id       INTEGER      NOT NULL REFERENCES players(player_id),
    season_id       INTEGER      NOT NULL REFERENCES seasons(season_id),
    team_id         INTEGER      NOT NULL REFERENCES teams(team_id),
    games_played    SMALLINT     NOT NULL DEFAULT 0,
    avg_pts         DECIMAL(5,2),
    avg_reb         DECIMAL(5,2),
    avg_ast         DECIMAL(5,2),
    avg_stl         DECIMAL(5,2),
    avg_blk         DECIMAL(5,2),
    avg_tov         DECIMAL(5,2),
    avg_min         DECIMAL(5,2),
    fg_pct          DECIMAL(5,4),
    fg3_pct         DECIMAL(5,4),
    ft_pct          DECIMAL(5,4),
    avg_plus_minus  DECIMAL(5,2),
    efg_pct         DECIMAL(5,4),
    ts_pct          DECIMAL(5,4),
    usg_pct         DECIMAL(5,4),
    per             DECIMAL(6,2),
    bpm             DECIMAL(5,2),
    CONSTRAINT uq_player_season_team UNIQUE (player_id, season_id, team_id)
);

COMMENT ON TABLE player_season_stats IS 'Агрегированная статистика игроков за сезон (~3000 строк)';
COMMENT ON COLUMN player_season_stats.pss_id IS 'Уникальный идентификатор записи сезонной статистики';
COMMENT ON COLUMN player_season_stats.player_id IS 'Ссылка на игрока';
COMMENT ON COLUMN player_season_stats.season_id IS 'Ссылка на сезон';
COMMENT ON COLUMN player_season_stats.team_id IS 'Команда для данной строки агрегата (отрезок сезона; при обмене — несколько строк на сезон)';
COMMENT ON COLUMN player_season_stats.games_played IS 'Количество сыгранных матчей';
COMMENT ON COLUMN player_season_stats.avg_pts IS 'Среднее количество очков за матч';
COMMENT ON COLUMN player_season_stats.avg_reb IS 'Среднее количество подборов за матч';
COMMENT ON COLUMN player_season_stats.avg_ast IS 'Среднее количество передач за матч';
COMMENT ON COLUMN player_season_stats.avg_stl IS 'Среднее количество перехватов за матч';
COMMENT ON COLUMN player_season_stats.avg_blk IS 'Среднее количество блоков за матч';
COMMENT ON COLUMN player_season_stats.avg_tov IS 'Среднее количество потерь за матч';
COMMENT ON COLUMN player_season_stats.avg_min IS 'Среднее время на площадке за матч';
COMMENT ON COLUMN player_season_stats.fg_pct IS 'Процент попаданий с игры';
COMMENT ON COLUMN player_season_stats.fg3_pct IS 'Процент попаданий с трёхочковой дистанции';
COMMENT ON COLUMN player_season_stats.ft_pct IS 'Процент попаданий штрафных бросков';
COMMENT ON COLUMN player_season_stats.avg_plus_minus IS 'Средний показатель плюс-минус';
COMMENT ON COLUMN player_season_stats.efg_pct IS 'Эффективный процент попаданий eFG%';
COMMENT ON COLUMN player_season_stats.ts_pct IS 'Показатель истинного процента бросков TS%';
COMMENT ON COLUMN player_season_stats.usg_pct IS 'Процент использования USG%';
COMMENT ON COLUMN player_season_stats.per IS 'Рейтинг эффективности игрока PER';
COMMENT ON COLUMN player_season_stats.bpm IS 'Показатель плюс-минус по боксскору BPM';

-- ============================================================
-- 8. ИСТОРИЯ ВЫСТУПЛЕНИЙ ЗА КОМАНДЫ (~2000 строк)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_team_history (
    history_id    SERIAL PRIMARY KEY,
    player_id     INTEGER     NOT NULL REFERENCES players(player_id),
    team_id       INTEGER     NOT NULL REFERENCES teams(team_id),
    season_id     INTEGER     NOT NULL REFERENCES seasons(season_id),
    start_date    DATE        NOT NULL,
    end_date      DATE,
    contract_type VARCHAR(20) NOT NULL DEFAULT 'Standard'
        CHECK (contract_type IN ('Standard', 'Two-Way', '10-Day', 'Exhibit-10')),
    CONSTRAINT chk_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE player_team_history IS 'История выступлений игроков в командах (~2000 строк)';
COMMENT ON COLUMN player_team_history.history_id IS 'Уникальный идентификатор записи истории';
COMMENT ON COLUMN player_team_history.player_id IS 'Ссылка на игрока';
COMMENT ON COLUMN player_team_history.team_id IS 'Ссылка на команду';
COMMENT ON COLUMN player_team_history.season_id IS 'Ссылка на сезон';
COMMENT ON COLUMN player_team_history.start_date IS 'Дата начала выступления за команду';
COMMENT ON COLUMN player_team_history.end_date IS 'Дата окончания выступления за команду (NULL = по сей день)';
COMMENT ON COLUMN player_team_history.contract_type IS 'Тип контракта: Standard, Two-Way, 10-Day, Exhibit-10';
