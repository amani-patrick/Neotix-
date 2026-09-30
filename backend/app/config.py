from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration.

    Values come from environment variables or a local `.env` file (never
    committed). Defaults exist so tests and local runs work out of the box.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Dataset Request Desk"
    app_env: str = "dev"  # dev | test | prod
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://desk:desk@localhost:5433/desk"

    # JWT / auth
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12


@lru_cache
def get_settings() -> Settings:
    return Settings()
