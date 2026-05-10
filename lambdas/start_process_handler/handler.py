import json
from datetime import datetime, timezone

from shared.dynamodb_service import get_document, put_process_job, update_document_status
from shared.ids import generate_process_id
from shared.logger import get_logger
from shared.response import build_response
from shared.s3_service import object_exists
from shared.sqs_service import send_processing_message
from shared.validation import ValidationError, validate_process_payload

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        document_id = (event.get("pathParameters") or {}).get("document_id")
        if not document_id:
            return build_response(400, {"error": "document_id path parameter is required"})
        payload = validate_process_payload(json.loads(event.get("body") or "{}"))
        document = get_document(document_id)
        if not document:
            return build_response(404, {"error": "Document not found"})
        if document["user_id"] != payload["user_id"]:
            return build_response(403, {"error": "user_id does not match document owner"})
        if not object_exists(document["s3_bucket"], document["s3_key"]):
            return build_response(400, {"error": "Document file has not been uploaded yet"})

        process_id = generate_process_id()
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "process_id": process_id,
            "document_id": document_id,
            "user_id": payload["user_id"],
            "status": "QUEUED",
            "stage": "QUEUED",
            "embedding_model": payload["embedding_model"],
            "chunking_strategy": payload["chunking_strategy"],
            "chunk_size": payload["chunk_size"],
            "chunk_overlap": payload["chunk_overlap"],
            "total_chunks": 0,
            "embedded_chunks": 0,
            "failed_chunks": 0,
            "error_message": None,
            "created_at": now,
            "updated_at": now,
        }
        put_process_job(job)
        update_document_status(
            document_id,
            upload_status="UPLOADED",
            processing_status="QUEUED",
            latest_process_id=process_id,
        )
        send_processing_message(
            {
                **job,
                "s3_bucket": document["s3_bucket"],
                "s3_key": document["s3_key"],
                "file_name": document["file_name"],
                "file_extension": document["file_extension"],
            }
        )
        return build_response(
            200,
            {
                "process_id": process_id,
                "document_id": document_id,
                "status": "QUEUED",
                "message": "Document processing job has started.",
            },
        )
    except ValidationError as exc:
        return build_response(400, {"error": str(exc)})
    except Exception:
        logger.exception("start process handler failed")
        return build_response(500, {"error": "Internal server error"})
