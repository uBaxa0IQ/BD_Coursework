-- ============================================================
-- NBA Statistics Database — Ролевая модель
-- Файл: 03_roles.sql
-- Описание: Создание ролей и пользователей с разграничением прав
-- ============================================================

-- Удаление пользователей и ролей если существуют
DROP USER IF EXISTS nba_admin_user;
DROP USER IF EXISTS nba_analyst_user;
DROP USER IF EXISTS nba_reader_user;
DROP ROLE IF EXISTS db_admin;
DROP ROLE IF EXISTS analyst;
DROP ROLE IF EXISTS reader;

-- ============================================================
-- СОЗДАНИЕ РОЛЕЙ
-- ============================================================
CREATE ROLE db_admin;
CREATE ROLE analyst;
CREATE ROLE reader;

COMMENT ON ROLE db_admin IS 'Администратор БД: полный CRUD + DDL на все объекты';
COMMENT ON ROLE analyst IS 'Аналитик: SELECT на все таблицы + EXECUTE на функции расчёта метрик';
COMMENT ON ROLE reader IS 'Читатель: SELECT только на представления (VIEW)';

-- ============================================================
-- ПРАВА ДЛЯ db_admin
-- Полный CRUD на все таблицы, последовательности, функции
-- DDL права предоставляются через суперпользователя nba_admin
-- Redis: GET, SET, DEL, FLUSH (управление через приложение)
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES     IN SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES  IN SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS  IN SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL PROCEDURES IN SCHEMA public TO db_admin;

-- ============================================================
-- ПРАВА ДЛЯ analyst
-- READ-ONLY на все таблицы
-- EXECUTE на функции calculate_* добавляется в 04_functions.sql
-- ============================================================
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO analyst;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO analyst;
-- NOTE: EXECUTE права на calculate_* функции добавляются в 04_functions.sql

-- ============================================================
-- ПРАВА ДЛЯ reader
-- SELECT только на VIEW — добавляется в 06_views.sql
-- НЕТ прямого доступа к таблицам
-- NOTE: SELECT права на VIEW добавляются в 06_views.sql
-- ============================================================

-- ============================================================
-- СОЗДАНИЕ ПОЛЬЗОВАТЕЛЕЙ
-- ============================================================
CREATE USER nba_admin_user
    WITH PASSWORD 'admin_pass_2024'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

CREATE USER nba_analyst_user
    WITH PASSWORD 'analyst_pass_2024'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

CREATE USER nba_reader_user
    WITH PASSWORD 'reader_pass_2024'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- ============================================================
-- ПРИВЯЗКА ПОЛЬЗОВАТЕЛЕЙ К РОЛЯМ
-- ============================================================
GRANT db_admin TO nba_admin_user;
GRANT analyst  TO nba_analyst_user;
GRANT reader   TO nba_reader_user;

-- ============================================================
-- ОГРАНИЧЕНИЕ ПРАВ НА СХЕМУ
-- ============================================================
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO db_admin, analyst, reader, nba_admin;
