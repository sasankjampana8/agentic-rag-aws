import json

import boto3
from botocore.exceptions import ClientError

from shared.config import settings
from shared.logger import get_logger

logger = get_logger(__name__)
s3 = boto3.client("s3", region_name=settings.AWS_REGION)


def create_presigned_post(s3_key: str, content_type: str) -> dict:
    logger.info("Creating presigned POST for key=%s", s3_key)
    return s3.generate_presigned_post(
        Bucket=settings.RAW_BUCKET,
        Key=s3_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, settings.MAX_FILE_SIZE_BYTES],
        ],
        ExpiresIn=settings.UPLOAD_EXPIRY_SECONDS,
    )


def object_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status == 404:
            return False
        raise


def download_file_bytes(bucket: str, key: str) -> bytes:
    logger.info("Downloading s3://%s/%s", bucket, key)
    return s3.get_object(Bucket=bucket, Key=key)["Body"].read()


def put_json(bucket: str, key: str, data: dict) -> None:
    logger.info("Writing JSON to s3://%s/%s", bucket, key)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(data).encode("utf-8"),
        ContentType="application/json",
    )
