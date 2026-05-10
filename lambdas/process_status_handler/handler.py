from shared.dynamodb_service import get_process_job
from shared.logger import get_logger
from shared.response import build_response

logger = get_logger(__name__)


def lambda_handler(event, context):
    try:
        process_id = (event.get("pathParameters") or {}).get("process_id")
        if not process_id:
            return build_response(400, {"error": "process_id path parameter is required"})
        job = get_process_job(process_id)
        if not job:
            return build_response(404, {"error": "Process job not found"})
        return build_response(
            200,
            {
                "process_id": job["process_id"],
                "document_id": job["document_id"],
                "status": job["status"],
                "stage": job["stage"],
                "total_chunks": int(job.get("total_chunks", 0)),
                "embedded_chunks": int(job.get("embedded_chunks", 0)),
                "failed_chunks": int(job.get("failed_chunks", 0)),
                "error_message": job.get("error_message"),
            },
        )
    except Exception:
        logger.exception("process status handler failed")
        return build_response(500, {"error": "Internal server error"})
