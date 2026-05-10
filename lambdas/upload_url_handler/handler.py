import json
from datetime import datetime, timezone

from shared.config import settings
from shared.dynamodb_service import put_document
from shared.ids import generate_document_id
from shared.logger import get_logger
from shared.response import build_response
from shared.s3_service import create_presigned_post
from shared.validation import ValidationError, validate_upload_payload

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        payload = json.loads(event.get("body") or "{}")
        user_id = payload.get("user_id")
        files = validate_upload_payload(payload)
        documents = []
        now = datetime.now(timezone.utc).isoformat()

        for file_info in files:
            document_id = generate_document_id()
            s3_key = f"raw/{user_id}/{document_id}/{file_info['safe_file_name']}"
            upload = create_presigned_post(s3_key, file_info["content_type"])
            item = {
                "document_id": document_id,
                "user_id": user_id,
                "file_name": file_info["file_name"],
                "safe_file_name": file_info["safe_file_name"],
                "file_extension": file_info["file_extension"],
                "content_type": file_info["content_type"],
                "file_size_bytes": file_info["file_size_bytes"],
                "s3_bucket": settings.RAW_BUCKET,
                "s3_key": s3_key,
                "upload_status": "PENDING_UPLOAD",
                "processing_status": "NOT_STARTED",
                "latest_process_id": None,
                "created_at": now,
                "updated_at": now,
            }
            put_document(item)
            documents.append(
                {
                    "document_id": document_id,
                    "file_name": file_info["file_name"],
                    "s3_bucket": settings.RAW_BUCKET,
                    "s3_key": s3_key,
                    "upload_status": "PENDING_UPLOAD",
                    "processing_status": "NOT_STARTED",
                    "upload": upload,
                }
            )

        return build_response(
            200,
            {
                "documents": documents,
                "max_files": settings.MAX_FILES,
                "max_file_size_bytes": settings.MAX_FILE_SIZE_BYTES,
            },
        )
    except ValidationError as exc:
        return build_response(400, {"error": str(exc)})
    except Exception:
        logger.exception("upload url handler failed")
        return build_response(500, {"error": "Internal server error"})
