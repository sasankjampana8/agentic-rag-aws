from datetime import datetime, timezone
from decimal import Decimal

import boto3

from shared.config import settings

dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
document_table = dynamodb.Table(settings.DOCUMENT_TABLE)
process_table = dynamodb.Table(settings.PROCESS_JOB_TABLE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def put_document(item: dict) -> None:
    document_table.put_item(Item=_clean(item))


def get_document(document_id: str) -> dict | None:
    response = document_table.get_item(Key={"document_id": document_id})
    return response.get("Item")


def update_document_status(
    document_id: str,
    upload_status: str | None = None,
    processing_status: str | None = None,
    latest_process_id: str | None = None,
) -> None:
    names = {"#updated_at": "updated_at"}
    values = {":updated_at": _now()}
    parts = ["#updated_at = :updated_at"]
    if upload_status is not None:
        names["#upload_status"] = "upload_status"
        values[":upload_status"] = upload_status
        parts.append("#upload_status = :upload_status")
    if processing_status is not None:
        names["#processing_status"] = "processing_status"
        values[":processing_status"] = processing_status
        parts.append("#processing_status = :processing_status")
    if latest_process_id is not None:
        names["#latest_process_id"] = "latest_process_id"
        values[":latest_process_id"] = latest_process_id
        parts.append("#latest_process_id = :latest_process_id")
    document_table.update_item(
        Key={"document_id": document_id},
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def put_process_job(item: dict) -> None:
    process_table.put_item(Item=_clean(item))


def get_process_job(process_id: str) -> dict | None:
    response = process_table.get_item(Key={"process_id": process_id})
    return response.get("Item")


def update_process_job(
    process_id: str,
    status: str | None = None,
    stage: str | None = None,
    error_message: str | None = None,
    counters: dict | None = None,
) -> None:
    names = {"#updated_at": "updated_at"}
    values = {":updated_at": _now()}
    parts = ["#updated_at = :updated_at"]
    for field, value in {
        "status": status,
        "stage": stage,
        "error_message": error_message,
        **(counters or {}),
    }.items():
        if value is not None:
            names[f"#{field}"] = field
            values[f":{field}"] = _clean(value)
            parts.append(f"#{field} = :{field}")
    process_table.update_item(
        Key={"process_id": process_id},
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
