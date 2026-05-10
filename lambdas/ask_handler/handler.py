import json

from shared.config import settings
from shared.logger import get_logger
from shared.openai_service import generate_answer
from shared.prompt_builder import (
    build_citations,
    build_context_from_chunks,
    build_system_prompt,
    build_user_prompt,
)
from shared.response import build_response
from shared.retrieval_service import retrieve_relevant_chunks
from shared.validation import ValidationError, validate_ask_payload

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        payload = validate_ask_payload(json.loads(event.get("body") or "{}"))
        chunks = retrieve_relevant_chunks(
            user_id=payload["user_id"],
            query=payload["query"],
            document_ids=payload.get("document_ids"),
            top_k=payload["top_k"],
            similarity_threshold=payload.get("similarity_threshold"),
        )
        context_text = build_context_from_chunks(chunks)
        answer = generate_answer(
            build_system_prompt(),
            build_user_prompt(payload["query"], context_text),
            payload["llm_model"],
        )
        return build_response(
            200,
            {
                "answer": answer,
                "citations": build_citations(chunks),
                "retrieved_chunks": len(chunks),
                "llm_model": payload["llm_model"],
                "embedding_model": settings.OPENAI_EMBEDDING_MODEL,
            },
        )
    except ValidationError as exc:
        return build_response(400, {"error": str(exc)})
    except Exception:
        logger.exception("ask handler failed")
        return build_response(500, {"error": "Internal server error"})
