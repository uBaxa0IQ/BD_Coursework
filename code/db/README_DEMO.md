# Демонстрация на защите: автоматический пересчёт метрик + кэширование

Сценарий показывает сквозной путь данных: **сырой матч → автотриггер пересчёта
сезонной статистики и продвинутых метрик (PER, TS%, eFG%, USG%, BPM) →
слой кэширования Redis → пользовательский интерфейс**.

Герой демо — **Luka Dončić (LAL), сезон 2025-26**. Добавляем ему один
выдающийся матч (70 очков + трипл-дабл) и наблюдаем изменение средних и PER.

## Файлы

| Файл | Назначение |
|------|-----------|
| `demo_insert.sql`   | Вставка демо-матча + статистики (печатает «до» и «после») |
| `demo_teardown.sql` | Откат: удаляет демо-матч и пересчитывает сезон (демо повторяемо) |

## Предусловие

Система поднята: `docker compose up -d` (postgres, redis, backend :8000, frontend :3000).
Проверить: <http://localhost:8000/health> должен вернуть
`{"status":"ok","postgresql":"healthy","redis":"healthy"}`.

---

## Обновление кэша (refresh)

Триггер пересчитывает агрегат в БД мгновенно, но API кэширует ответы в Redis
(Cache-Aside, TTL ~120 с). Поэтому после вставки UI может показывать **старые**
цифры, пока кэш не сброшен — это и есть демонстрация слоя кэширования.

Эндпоинт `POST /admin/refresh/{season_id}` пересчитывает сезон **и** чистит кэш.
`season_id = 5` — сезон 2025-26.

**Способ 1 — терминал (curl):**
```powershell
curl.exe -X POST "http://localhost:8000/admin/refresh/5" -H "x-api-key: nba-stats-secret-key-2024"
```
Ответ при успехе:
```json
{"status":"ok","season_id":5,"season_label":"2025-26","cache_keys_deleted":N,"message":"Stats refreshed for season 2025-26"}
```
`cache_keys_deleted` > 0, если страницы уже открывались и осели в кэше; `0` — если
кэш был пуст (никто ещё не запрашивал данные после рестарта).

**Способ 2 — Swagger UI (нагляднее на защите):**
<http://localhost:8000/docs> → `POST /admin/refresh/{season_id}` → *Try it out* →
`season_id = 5`, поле `x-api-key` = `nba-stats-secret-key-2024` → *Execute*.

**Способ 3 — только лидерборд (точечно, без пересчёта):**
```powershell
curl.exe -X DELETE "http://localhost:8000/admin/cache/leaders" -H "x-api-key: nba-stats-secret-key-2024"
```

> ⚠️ Если `/admin/refresh` отдаёт `Internal Server Error` — проверь, что в
> `code/.env` заданы **все три** URL БД (`DATABASE_URL`, `DATABASE_URL_ADMIN`,
> `DATABASE_URL_READER`) с хостом `postgres`. Если admin/reader URL не заданы,
> backend берёт дефолт с `localhost` и не достучится до БД из контейнера
> (`Connection refused`). После правки `.env`: `docker compose up -d backend`.

---

## Ход демонстрации

### Шаг 1. Показать состояние «ДО» в интерфейсе
Открыть в браузере:
- Профиль игрока: <http://localhost:3000/players/1155>
- Таблица лидеров: <http://localhost:3000/leaderboard>

Зафиксировать текущие значения: **65 игр, 32.97 очк, PER 30.37**.

### Шаг 2. Вставить демо-матч (срабатывает триггер)
```powershell
cd E:\CW\code
Get-Content db\demo_insert.sql | docker compose exec -T postgres psql -U nba_admin -d nba_stats
```
В выводе psql видно:
- `NOTICE: Обновлена статистика за сезон 5: 593 игроков` — **триггер
  `trigger_update_season_stats` сработал автоматически** (мы его не вызывали);
- блок «ПОСЛЕ»: **66 игр, 33.53 очк, TS% 0.6197, PER 30.91**.

> Что подчеркнуть: мы вставили только сырую статистику матча в
> `game_player_stats`. Агрегат `player_season_stats`, включая продвинутые
> метрики, пересчитала процедура `update_season_stats()`, вызванная триггером
> `AFTER INSERT ... FOR EACH STATEMENT`. Заодно отложенный constraint-триггер
> `trg_check_team_score` проверил, что сумма очков игроков = счёту команды.

### Шаг 3. Показать работу кэша
Сразу обновить страницу игрока — данные могут остаться **старыми**: ответ
отдаётся из кэша Redis (Cache-Aside). Это и есть демонстрация кэширования из
исследовательского раздела.

Сбросить кэш и пересчитать через admin-эндпоинт:
```powershell
curl.exe -X POST "http://localhost:8000/admin/refresh/5" -H "x-api-key: nba-stats-secret-key-2024"
```
(или `DELETE http://localhost:8000/admin/cache/leaders` — точечно для лидерборда)

### Шаг 4. Показать состояние «ПОСЛЕ» в интерфейсе
Обновить страницы из шага 1 — теперь среднее очков и PER выросли, Лука
поднимается выше в таблице лидеров.

### Шаг 5. Откат (чтобы демо можно было повторить)
```powershell
Get-Content db\demo_teardown.sql | docker compose exec -T postgres psql -U nba_admin -d nba_stats
curl.exe -X POST "http://localhost:8000/admin/refresh/5" -H "x-api-key: nba-stats-secret-key-2024"
```
Статистика Луки вернётся к 65 играм / 32.97 / PER 30.37.

---

---

## Вариант 2 — добавление НОВОГО игрока (полный pipeline)

Файлы: `demo_new_player.sql`, `demo_new_player_teardown.sql`.

Показывает весь путь: вставка игрока в справочник `players` → вставка его
матчей → автоматическое создание строки агрегата `player_season_stats`
триггером → появление игрока в UI.

Вставляем вымышленного игрока **Ivan Zhuravlev** (LAL) и **два** матча (5 и
6 июня 2026). Двух матчей нужно, чтобы пройти порог квалификации
`SUM(minutes_played) >= 50` в процедуре `update_season_stats` — за один матч
(<=48 мин) игрок в агрегат не попадёт.

```powershell
cd E:\CW\code
Get-Content db\demo_new_player.sql | docker compose exec -T postgres psql -U nba_admin -d nba_stats
curl.exe -X POST "http://localhost:8000/admin/refresh/5" -H "x-api-key: nba-stats-secret-key-2024"
```
Результат: игрок появляется с **2 играми, 28.0 очк, PER 31.43**.
В UI: <http://localhost:3000/players> → поиск «Zhuravlev» → открыть профиль.
(Фото с CDN NBA не подтянется — у вымышленного `nba_id` его нет, это нормально.)

Откат:
```powershell
Get-Content db\demo_new_player_teardown.sql | docker compose exec -T postgres psql -U nba_admin -d nba_stats
curl.exe -X POST "http://localhost:8000/admin/refresh/5" -H "x-api-key: nba-stats-secret-key-2024"
```

---

## Вариант 3 — контроль целостности (намеренная ошибка)

Файл: `demo_integrity_fail.sql`.

Показывает, что БД сама отвергает несогласованные данные. Вставляем
завершённый матч, где `home_score=99`, а единственный игрок команды набрал 70.
Отложенный `CONSTRAINT TRIGGER trg_check_team_score` (`INITIALLY DEFERRED`)
срабатывает в момент `COMMIT`:

```powershell
Get-Content db\demo_integrity_fail.sql | docker compose exec -T postgres psql -U nba_admin -d nba_stats
```
Ожидаемый вывод (транзакция откатывается, в БД ничего не остаётся):
```
ERROR:  Player points sum (game_id=..., team_id=14) does not match team score (70 vs 99)
```
Откат не нужен — `ROLLBACK` происходит автоматически.

---

## Запасной вариант — через REST API (если спросят про backend)
Эндпоинт `POST /admin/refresh/{season_id}` пересчитывает сезон и инвалидирует
кэш программно — то же самое, что делает триггер на уровне БД, но вызвано из
приложения. Удобно показать Swagger UI: <http://localhost:8000/docs>.
