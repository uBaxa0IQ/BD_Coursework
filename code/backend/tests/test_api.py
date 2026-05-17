"""
Тесты API через httpx.AsyncClient.
Используют реальную тестовую БД без моков.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root(client: AsyncClient):
    """GET / должен возвращать статус ok."""
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """GET /health должен возвращать статус."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "postgresql" in data
    assert "redis" in data


@pytest.mark.asyncio
async def test_get_league_seasons(client: AsyncClient):
    """GET /league/seasons должен возвращать список сезонов."""
    resp = await client.get("/league/seasons")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        assert "season_id" in data[0]
        assert "label" in data[0]


@pytest.mark.asyncio
async def test_get_teams(client: AsyncClient):
    """GET /teams должен возвращать список команд."""
    resp = await client.get("/teams")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        assert "team_id" in data[0]
        assert "name" in data[0]


@pytest.mark.asyncio
async def test_get_standings(client: AsyncClient):
    """GET /teams/standings?season_id=1 должен возвращать East и West."""
    resp = await client.get("/teams/standings?season_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "East" in data
    assert "West" in data


@pytest.mark.asyncio
async def test_get_players_returns_list(client: AsyncClient):
    """GET /players?season_id=1 должен возвращать список игроков."""
    resp = await client.get("/players?season_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "player_id" in item
        assert "first_name" in item


@pytest.mark.asyncio
async def test_get_leaders_valid_metric(client: AsyncClient):
    """GET /stats/leaders?metric=per&season_id=1 должен возвращать отсортированный список."""
    resp = await client.get("/stats/leaders?metric=per&season_id=1&limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) >= 2:
        # Проверить сортировку по убыванию
        values = [float(item["value"]) for item in data if item.get("value") is not None]
        assert values == sorted(values, reverse=True), "Лидерборд не отсортирован по убыванию"


@pytest.mark.asyncio
async def test_get_leaders_invalid_metric(client: AsyncClient):
    """GET /stats/leaders с невалидной метрикой должен возвращать 422."""
    resp = await client.get("/stats/leaders?metric=invalid_metric&season_id=1")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search(client: AsyncClient):
    """GET /league/search?q=lak должен возвращать results."""
    resp = await client.get("/league/search?q=lak")
    assert resp.status_code == 200
    data = resp.json()
    assert "players" in data
    assert "teams" in data


@pytest.mark.asyncio
async def test_admin_refresh_requires_key(client: AsyncClient):
    """POST /admin/refresh/1 без X-API-Key должен возвращать 401."""
    resp = await client.post("/admin/refresh/1")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_refresh_with_wrong_key(client: AsyncClient):
    """POST /admin/refresh/1 с неверным ключом должен возвращать 401."""
    resp = await client.post(
        "/admin/refresh/1",
        headers={"X-API-Key": "wrong-key"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_league_trends(client: AsyncClient):
    """GET /league/trends должен возвращать список."""
    resp = await client.get("/league/trends")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_league_dashboard(client: AsyncClient):
    """GET /league/dashboard?season_id=1 должен содержать нужные поля."""
    resp = await client.get("/league/dashboard?season_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "season_id" in data
    assert "top_players_per" in data
