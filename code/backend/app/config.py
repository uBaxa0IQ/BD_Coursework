from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Параметры приложения. По умолчанию чтение — роль analyst (см. отчёт, матрица ACL)."""

    DATABASE_URL: str = (
        "postgresql+asyncpg://nba_analyst_user:analyst_pass_2024@localhost:5432/nba_stats"
    )
    DATABASE_URL_ADMIN: str = (
        "postgresql+asyncpg://nba_admin_user:admin_pass_2024@localhost:5432/nba_stats"
    )
    DATABASE_URL_READER: str = (
        "postgresql+asyncpg://nba_reader_user:reader_pass_2024@localhost:5432/nba_stats"
    )
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "nba-stats-secret-key-2024"
    ENVIRONMENT: str = "development"
    REDIS_DEFAULT_TTL: int = 300

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
