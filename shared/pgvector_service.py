import json
from typing import Iterable

import psycopg
from psycopg.rows import dict_row

from shared.config import settings


def _vector_literal(values: Iterable[float]) -> str:
    return "[" + ",".join(str(float(v)) for v in values) + "]"


def get_connection():
    return psycopg.connect(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DATABASE,
        user=settings.PG_USER,
        password=settings.PG_PASSWORD,
        row_factory=dict_row,
    )


def insert_chunks(chunks: list[dict]) -> None:
    if not chunks:
        return
    sql = """
        INSERT INTO document_chunks (
            chunk_id, document_id, user_id, file_name, page_number, chunk_index,
            chunk_text, embedding, embedding_model, chunking_strategy, metadata
        )
        VALUES (
            %(chunk_id)s, %(document_id)s, %(user_id)s, %(file_name)s, %(page_number)s,
            %(chunk_index)s, %(chunk_text)s, %(embedding)s::vector, %(embedding_model)s,
            %(chunking_strategy)s, %(metadata)s::jsonb
        )
        ON CONFLICT (chunk_id) DO NOTHING
    """
    rows = []
    for chunk in chunks:
        metadata = chunk.get("metadata", {})
        rows.append(
            {
                **chunk,
                "embedding": _vector_literal(chunk["embedding"]),
                "chunking_strategy": metadata.get("chunking_strategy", "recursive"),
                "metadata": json.dumps(metadata),
            }
        )
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()


def search_chunks(
    user_id: str,
    query_embedding: list[float],
    document_ids: list[str] | None = None,
    top_k: int = 5,
    similarity_threshold: float | None = None,
) -> list[dict]:
    params = {
        "user_id": user_id,
        "embedding": _vector_literal(query_embedding),
        "top_k": top_k,
    }
    clauses = ["user_id = %(user_id)s"]
    if document_ids:
        clauses.append("document_id = ANY(%(document_ids)s)")
        params["document_ids"] = document_ids
    threshold_clause = ""
    if similarity_threshold is not None:
        threshold_clause = "WHERE score >= %(similarity_threshold)s"
        params["similarity_threshold"] = similarity_threshold

    sql = f"""
        SELECT * FROM (
            SELECT
                chunk_id,
                document_id,
                file_name,
                page_number,
                chunk_index,
                chunk_text AS text,
                1 - (embedding <=> %(embedding)s::vector) AS score
            FROM document_chunks
            WHERE {" AND ".join(clauses)}
            ORDER BY embedding <=> %(embedding)s::vector
            LIMIT %(top_k)s
        ) ranked
        {threshold_clause}
        ORDER BY score DESC
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())
