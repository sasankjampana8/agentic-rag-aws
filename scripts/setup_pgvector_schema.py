import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.pgvector_service import get_connection


SQL_FILES = [
    ROOT / "sql" / "create_pgvector_extension.sql",
    ROOT / "sql" / "create_document_chunks_table.sql",
    ROOT / "sql" / "create_indexes.sql",
]


def main() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            for sql_file in SQL_FILES:
                print(f"Running {sql_file.name}...")
                cur.execute(sql_file.read_text(encoding="utf-8"))
        conn.commit()
    print("pgvector schema setup complete.")


if __name__ == "__main__":
    main()
