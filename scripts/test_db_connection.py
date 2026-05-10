import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.pgvector_service import get_connection


def main() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version() AS version")
            print(cur.fetchone()["version"])
    print("Database connection OK")


if __name__ == "__main__":
    main()
