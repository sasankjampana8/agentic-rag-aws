import os
import re
from typing import Any

from shared.config import settings

ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


class ValidationError(ValueError):
    pass


def _require_string(payload: dict, field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field} is required")
    return value.strip()


def sanitize_file_name(file_name: str) -> str:
    base = os.path.basename(file_name or "").strip()
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)
    base = re.sub(r"\s+", "_", base)
    return base[:180] or "document"


def validate_upload_payload(payload: dict) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValidationError("request body must be an object")
    _require_string(payload, "user_id")
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        raise ValidationError("files must be a non-empty list")
    if len(files) > settings.MAX_FILES:
        raise ValidationError(f"files cannot contain more than {settings.MAX_FILES} items")

    validated = []
    for item in files:
        if not isinstance(item, dict):
            raise ValidationError("each file must be an object")
        file_name = sanitize_file_name(_require_string(item, "file_name"))
        content_type = _require_string(item, "content_type")
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise ValidationError(f"unsupported content_type: {content_type}")
        expected_extension = ALLOWED_CONTENT_TYPES[content_type]
        actual_extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        if actual_extension != expected_extension:
            raise ValidationError(
                f"file extension .{actual_extension or '(missing)'} does not match {content_type}"
            )
        file_size = item.get("file_size_bytes")
        if not isinstance(file_size, int) or file_size <= 0:
            raise ValidationError("file_size_bytes must be a positive integer")
        if file_size > settings.MAX_FILE_SIZE_BYTES:
            raise ValidationError(f"file exceeds max size of {settings.MAX_FILE_SIZE_BYTES} bytes")
        validated.append(
            {
                "file_name": item["file_name"],
                "safe_file_name": file_name,
                "content_type": content_type,
                "file_extension": expected_extension,
                "file_size_bytes": file_size,
            }
        )
    return validated


def validate_process_payload(payload: dict) -> dict:
    payload = payload or {}
    user_id = _require_string(payload, "user_id")
    chunk_size = int(payload.get("chunk_size", settings.CHUNK_SIZE))
    chunk_overlap = int(payload.get("chunk_overlap", settings.CHUNK_OVERLAP))
    if chunk_size <= 0:
        raise ValidationError("chunk_size must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValidationError("chunk_overlap must be greater than or equal to 0 and less than chunk_size")
    return {
        "user_id": user_id,
        "embedding_model": payload.get("embedding_model", settings.OPENAI_EMBEDDING_MODEL),
        "chunking_strategy": payload.get("chunking_strategy", "recursive"),
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
    }


def _validate_query_payload(payload: dict, require_llm: bool = False) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError("request body must be an object")
    user_id = _require_string(payload, "user_id")
    query = _require_string(payload, "query")
    document_ids = payload.get("document_ids")
    if document_ids is not None and (
        not isinstance(document_ids, list) or not all(isinstance(v, str) and v for v in document_ids)
    ):
        raise ValidationError("document_ids must be a list of strings")
    top_k = int(payload.get("top_k", settings.DEFAULT_TOP_K))
    if top_k <= 0 or top_k > 50:
        raise ValidationError("top_k must be between 1 and 50")
    result = {
        "user_id": user_id,
        "query": query,
        "document_ids": document_ids,
        "top_k": top_k,
        "similarity_threshold": payload.get("similarity_threshold", settings.DEFAULT_SIMILARITY_THRESHOLD),
    }
    if require_llm:
        result["llm_model"] = payload.get("llm_model", settings.OPENAI_LLM_MODEL)
    return result


def validate_retrieval_payload(payload: dict) -> dict:
    return _validate_query_payload(payload)


def validate_ask_payload(payload: dict) -> dict:
    return _validate_query_payload(payload, require_llm=True)
