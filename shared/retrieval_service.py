from shared.config import settings
from shared.openai_service import embed_query
from shared.pgvector_service import search_chunks


def retrieve_relevant_chunks(
    user_id: str,
    query: str,
    document_ids: list[str] | None = None,
    top_k: int = settings.DEFAULT_TOP_K,
    similarity_threshold: float | None = settings.DEFAULT_SIMILARITY_THRESHOLD,
) -> list[dict]:
    query_embedding = embed_query(query, settings.OPENAI_EMBEDDING_MODEL)
    return search_chunks(
        user_id=user_id,
        query_embedding=query_embedding,
        document_ids=document_ids,
        top_k=top_k,
        similarity_threshold=similarity_threshold,
    )
