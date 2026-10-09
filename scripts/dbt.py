"""Startet dbt mit den Zugangsdaten aus DATABASE_URL (Standard: lokale Supabase-Datenbank)."""
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

LOKALE_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
WURZEL = Path(__file__).resolve().parent.parent


def umgebung(url: str) -> dict[str, str]:
    teile = urlparse(url)
    abfrage = parse_qs(teile.query)
    host = teile.hostname or "127.0.0.1"
    # Ohne sslmode in der URL: unverschlüsselt nur zur lokalen Datenbank, sonst TLS erzwingen.
    sslmode_standard = "disable" if host in ("127.0.0.1", "localhost") else "require"
    return {
        "HB_DB_HOST": host,
        "HB_DB_PORT": str(teile.port or 5432),
        "HB_DB_USER": unquote(teile.username or "postgres"),
        "HB_DB_PASSWORD": unquote(teile.password or ""),
        "HB_DB_NAME": teile.path.lstrip("/") or "postgres",
        "HB_DB_SSLMODE": abfrage.get("sslmode", [sslmode_standard])[0],
    }


def dbt_programm() -> str:
    for kandidat in (WURZEL / ".venv" / "Scripts" / "dbt.exe", WURZEL / ".venv" / "bin" / "dbt"):
        if kandidat.exists():
            return str(kandidat)
    gefunden = shutil.which("dbt")
    if not gefunden:
        sys.exit("dbt nicht gefunden. Einrichten: uv venv .venv --python 3.13 && uv pip install --python .venv -r dbt/requirements.txt")
    return gefunden


if __name__ == "__main__":
    env = {**os.environ, **umgebung(os.environ.get("DATABASE_URL") or LOKALE_DB)}
    befehl = [dbt_programm(), *sys.argv[1:], "--project-dir", str(WURZEL / "dbt"), "--profiles-dir", str(WURZEL / "dbt")]
    sys.exit(subprocess.call(befehl, env=env))
