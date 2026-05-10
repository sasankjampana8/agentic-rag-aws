def build_system_prompt() -> str:
    return (
        "You are CloudRAG Agent. Answer only from the provided document context. "
        "If the context is insufficient, say the uploaded documents do not contain enough information. "
        "Be concise, accurate, and cite the supplied context markers."
    )


def build_context_from_chunks(chunks: list[dict]) -> str:
    lines = []
    for index, chunk in enumerate(chunks, start=1):
        lines.append(
            "[{idx}] document_id={document_id} file_name={file_name} page={page_number} "
            "chunk_id={chunk_id} score={score}\n{text}".format(
                idx=index,
                document_id=chunk.get("document_id"),
                file_name=chunk.get("file_name"),
                page_number=chunk.get("page_number"),
                chunk_id=chunk.get("chunk_id"),
                score=round(float(chunk.get("score", 0)), 4),
                text=chunk.get("text") or chunk.get("chunk_text") or "",
            )
        )
    return "\n\n".join(lines)


def build_user_prompt(query: str, context: str) -> str:
    return f"Context:\n{context or '(no retrieved context)'}\n\nQuestion:\n{query}\n\nAnswer with citations."


def build_citations(chunks: list[dict]) -> list[dict]:
    return [
        {
            "chunk_id": chunk.get("chunk_id"),
            "document_id": chunk.get("document_id"),
            "file_name": chunk.get("file_name"),
            "page_number": chunk.get("page_number"),
            "score": float(chunk.get("score", 0)),
        }
        for chunk in chunks
    ]
