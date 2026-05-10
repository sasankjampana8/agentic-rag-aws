from shared.dynamodb_service import get_document, update_document_status
from shared.logger import get_logger
from shared.response import build_response
from shared.s3_service import object_exists

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        document_id = (event.get("pathParameters") or {}).get("document_id")
        if not document_id:
            return build_response(400, {"error": "document_id path parameter is required"})
        document = get_document(document_id)
        if not document:
            return build_response(404, {"error": "Document not found"})

        exists = object_exists(document["s3_bucket"], document["s3_key"])
        if exists and document.get("upload_status") == "PENDING_UPLOAD":
            update_document_status(document_id, upload_status="UPLOADED")
            document["upload_status"] = "UPLOADED"

        return build_response(
            200,
            {
                "document_id": document["document_id"],
                "user_id": document["user_id"],
                "file_name": document["file_name"],
                "upload_status": document["upload_status"],
                "processing_status": document["processing_status"],
                "latest_process_id": document.get("latest_process_id"),
                "s3_object_exists": exists,
            },
        )
    except Exception:
        logger.exception("document status handler failed")
        return build_response(500, {"error": "Internal server error"})
