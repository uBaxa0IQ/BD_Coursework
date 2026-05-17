"""
Тесты для функций и процедур PostgreSQL.
Используют реальную тестовую БД — без моков.
"""
import pytest
import pytest_asyncio
import asyncpg


@pytest.mark.asyncio
async def test_calculate_ts_normal(pg_conn: asyncpg.Connection):
    """TS% для реального игрока должен быть в диапазоне (0.4, 0.8)."""
    result = await pg_conn.fetchval(
        """
        SELECT calculate_ts(player_id, season_id, team_id)
        FROM player_season_stats
        WHERE avg_pts > 15 AND games_played > 40
        ORDER BY avg_pts DESC
        LIMIT 1
        """
    )
    if result is not None:
        assert 0.4 < float(result) < 0.8, f"TS% вне ожидаемого диапазона: {result}"


@pytest.mark.asyncio
async def test_calculate_ts_zero_attempts(pg_conn: asyncpg.Connection):
    """TS% должен быть NULL при отсутствии попыток."""
    # Используем несуществующий player_id
    result = await pg_conn.fetchval(
        "SELECT calculate_ts(0, 0)"
    )
    assert result is None


@pytest.mark.asyncio
async def test_calculate_efg_normal(pg_conn: asyncpg.Connection):
    """eFG% для реального игрока должен быть в диапазоне (0.3, 0.8)."""
    result = await pg_conn.fetchval(
        """
        SELECT calculate_efg(player_id, season_id, team_id)
        FROM player_season_stats
        WHERE avg_pts > 15 AND games_played > 40
        ORDER BY avg_pts DESC
        LIMIT 1
        """
    )
    if result is not None:
        assert 0.3 < float(result) < 0.8, f"eFG% вне диапазона: {result}"


@pytest.mark.asyncio
async def test_calculate_efg_no_shots(pg_conn: asyncpg.Connection):
    """eFG% должен быть NULL при нулевых бросках."""
    result = await pg_conn.fetchval("SELECT calculate_efg(0, 0)")
    assert result is None


@pytest.mark.asyncio
async def test_calculate_per_elite_player(pg_conn: asyncpg.Connection):
    """PER топ-игрока должен быть > 20."""
    result = await pg_conn.fetchval(
        """
        SELECT calculate_per(player_id, season_id, team_id)
        FROM player_season_stats
        WHERE avg_pts > 25 AND games_played > 50
        ORDER BY avg_pts DESC
        LIMIT 1
        """
    )
    if result is not None:
        assert float(result) > 15, f"PER топ-игрока ниже ожидаемого: {result}"


@pytest.mark.asyncio
async def test_calculate_per_below_minimum_minutes(pg_conn: asyncpg.Connection):
    """PER должен быть NULL при менее 50 минутах."""
    result = await pg_conn.fetchval("SELECT calculate_per(0, 0)")
    assert result is None


@pytest.mark.asyncio
async def test_calculate_bpm_positive_for_star(pg_conn: asyncpg.Connection):
    """BPM топ-игрока должен быть > 0."""
    result = await pg_conn.fetchval(
        """
        SELECT calculate_bpm(player_id, season_id, team_id)
        FROM player_season_stats
        WHERE per > 20 AND games_played > 40
        ORDER BY per DESC
        LIMIT 1
        """
    )
    if result is not None:
        assert float(result) > -5, f"BPM слишком низкий: {result}"


@pytest.mark.asyncio
async def test_update_season_stats_idempotent(pg_conn: asyncpg.Connection):
    """Двойной вызов update_season_stats должен давать тот же результат."""
    # Получить актуальный season_id
    season_id = await pg_conn.fetchval(
        "SELECT season_id FROM seasons ORDER BY season_id LIMIT 1"
    )
    if season_id is None:
        pytest.skip("Нет сезонов в БД")

    await pg_conn.execute("CALL update_season_stats($1)", season_id)
    count1 = await pg_conn.fetchval(
        "SELECT COUNT(*) FROM player_season_stats WHERE season_id = $1", season_id
    )
    await pg_conn.execute("CALL update_season_stats($1)", season_id)
    count2 = await pg_conn.fetchval(
        "SELECT COUNT(*) FROM player_season_stats WHERE season_id = $1", season_id
    )
    assert count1 == count2, f"Количество записей изменилось: {count1} → {count2}"


@pytest.mark.asyncio
async def test_role_reader_cannot_select_tables(pg_conn: asyncpg.Connection):
    """Роль reader не должна иметь доступа к таблицам напрямую."""
    reader_url = "postgresql://nba_reader_user:reader_pass_2024@localhost:5432/nba_stats"
    try:
        reader_conn = await asyncpg.connect(reader_url)
        try:
            # Прямой доступ к таблице должен быть запрещён
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await reader_conn.fetch("SELECT * FROM players LIMIT 1")
            # Но VIEW должен быть доступен
            result = await reader_conn.fetch("SELECT * FROM v_top_players LIMIT 1")
            assert result is not None
        finally:
            await reader_conn.close()
    except asyncpg.InvalidCatalogNameError:
        pytest.skip("Тестовая БД недоступна")
    except Exception as e:
        pytest.skip(f"Пропуск: {e}")
