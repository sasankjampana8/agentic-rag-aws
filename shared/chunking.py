import re

from shared.config import settings
from shared.ids import generate_chunk_id


def _split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    chunks = []
    start = 0
    while start < len(normalized):
        end = min(start + chunk_size, len(normalized))
        if end < len(normalized):
            boundary = max(normalized.rfind(". ", start, end), normalized.rfind(" ", start, end))
            if boundary > start + int(chunk_size * 0.5):
                end = boundary + 1
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(end - chunk_overlap, start + 1)
    return chunks


def chunk_extracted_text(
    extracted_text: dict,
    chunk_size: int = settings.CHUNK_SIZE,
    chunk_overlap: int = settings.CHUNK_OVERLAP,
    chunking_strategy: str = "recursive",
) -> list[dict]:
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be less than chunk_size")
    document_id = extracted_text["document_id"]
    output = []
    chunk_index = 0
    for page in extracted_text.get("pages", []):
        for chunk_text in _split_text(page.get("text", ""), chunk_size, chunk_overlap):
            output.append(
                {
                    "chunk_id": generate_chunk_id(),
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                    "page_number": page.get("page_number"),
                    "chunk_text": chunk_text,
                    "metadata": {
                        "chunking_strategy": chunking_strategy,
                        "chunk_size": chunk_size,
                        "chunk_overlap": chunk_overlap,
                    },
                }
            )
            chunk_index += 1
    return output
