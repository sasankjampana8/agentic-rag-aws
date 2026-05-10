import json

from shared.logger import get_logger
from shared.response import build_response
from shared.retrieval_service import retrieve_relevant_chunks
from shared.validation import ValidationError, validate_retrieval_payload

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        payload = validate_retrieval_payload(json.loads(event.get("body") or "{}"))
        results = retrieve_relevant_chunks(**payload)
        return build_response(200, {"query": payload["query"], "results": results})
    except ValidationError as exc:
        return build_response(400, {"error": str(exc)})
    except Exception:
        logger.exception("retrieval handler failed")
        return build_response(500, {"error": "Internal server error"})
