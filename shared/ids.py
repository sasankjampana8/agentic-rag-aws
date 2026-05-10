import uuid


def generate_document_id() -> str:
    return f"doc_{uuid.uuid4().hex}"


def generate_process_id() -> str:
    return f"proc_{uuid.uuid4().hex}"


def generate_chunk_id() -> str:
    return f"chunk_{uuid.uuid4().hex}"
