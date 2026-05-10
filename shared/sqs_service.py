import json

import boto3

from shared.config import settings

sqs = boto3.client("sqs", region_name=settings.AWS_REGION)


def send_processing_message(message: dict) -> None:
    sqs.send_message(QueueUrl=settings.PROCESS_QUEUE_URL, MessageBody=json.dumps(message))
