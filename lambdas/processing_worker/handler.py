import json

from shared.chunking import chunk_extracted_text
from shared.dynamodb_service import update_document_status, update_process_job
from shared.logger import get_logger
from shared.openai_service import embed_texts
from shared.pgvector_service import insert_chunks
from shared.s3_service import download_file_bytes, put_json
from shared.text_extractors import extract_text

logger = get_logger(__name__)


def lambda_handler(event, context):
    for record in event.get("Records", []):
        message = json.loads(record["body"])
        _process_message(message)
    return {"batchItemFailures": []}


def _process_message(message: dict) -> None:
    process_id = message["process_id"]
    document_id = message["document_id"]
    user_id = message["user_id"]
    try:
        update_process_job(process_id, status="PROCESSING", stage="TEXT_EXTRACTION_STARTED")
        file_bytes = download_file_bytes(message["s3_bucket"], message["s3_key"])
        extracted = extract_text(file_bytes, message["file_extension"], document_id)
        put_json(
            message["s3_bucket"],
            f"processed/{user_id}/{document_id}/extracted_text.json",
            extracted,
        )

        update_process_job(process_id, stage="TEXT_EXTRACTION_COMPLETED")
        update_process_job(process_id, stage="CHUNKING_STARTED")
        chunks = chunk_extracted_text(
            extracted,
            chunk_size=int(message["chunk_size"]),
            chunk_overlap=int(message["chunk_overlap"]),
            chunking_strategy=message.get("chunking_strategy", "recursive"),
        )
        update_process_job(
            process_id,
            stage="CHUNKING_COMPLETED",
            counters={"total_chunks": len(chunks)},
        )

        update_process_job(process_id, stage="EMBEDDING_STARTED")
        embeddings = embed_texts([chunk["chunk_text"] for chunk in chunks], message["embedding_model"])
        for chunk, embedding in zip(chunks, embeddings):
            chunk.update(
                {
                    "embedding": embedding,
                    "embedding_model": message["embedding_model"],
                    "user_id": user_id,
                    "file_name": message.get("file_name"),
                }
            )

        update_process_job(process_id, stage="INDEXING_STARTED")
        insert_chunks(chunks)
        update_process_job(
            process_id,
            status="COMPLETED",
            stage="COMPLETED",
            counters={"embedded_chunks": len(chunks), "failed_chunks": 0},
        )
        update_document_status(document_id, processing_status="COMPLETED")
        logger.info("Processing completed process_id=%s chunks=%s", process_id, len(chunks))
    except Exception as exc:
        logger.exception("processing failed process_id=%s", process_id)
        update_process_job(
            process_id,
            status="FAILED",
            stage="FAILED",
            error_message=str(exc),
        )
        update_document_status(document_id, processing_status="FAILED")
        raise
