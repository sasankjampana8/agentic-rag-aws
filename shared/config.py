import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    RAW_BUCKET: str = os.getenv("RAW_BUCKET", "")
    DOCUMENT_TABLE: str = os.getenv("DOCUMENT_TABLE", "cloudrag_documents")
    PROCESS_JOB_TABLE: str = os.getenv("PROCESS_JOB_TABLE", "cloudrag_process_jobs")
    PROCESS_QUEUE_URL: str = os.getenv("PROCESS_QUEUE_URL", "")
    UPLOAD_EXPIRY_SECONDS: int = _int("UPLOAD_EXPIRY_SECONDS", 900)
    MAX_FILES: int = _int("MAX_FILES", 10)
    MAX_FILE_SIZE_BYTES: int = _int("MAX_FILE_SIZE_BYTES", 10_485_760)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    OPENAI_LLM_MODEL: str = os.getenv("OPENAI_LLM_MODEL", "gpt-4.1-mini")
    PG_HOST: str = os.getenv("PG_HOST", "")
    PG_PORT: int = _int("PG_PORT", 5432)
    PG_DATABASE: str = os.getenv("PG_DATABASE", "cloudragdb")
    PG_USER: str = os.getenv("PG_USER", "postgres")
    PG_PASSWORD: str = os.getenv("PG_PASSWORD", "")
    CHUNK_SIZE: int = _int("CHUNK_SIZE", 800)
    CHUNK_OVERLAP: int = _int("CHUNK_OVERLAP", 120)
    EMBEDDING_BATCH_SIZE: int = _int("EMBEDDING_BATCH_SIZE", 50)
    DEFAULT_TOP_K: int = _int("DEFAULT_TOP_K", 5)
    DEFAULT_SIMILARITY_THRESHOLD: float = _float("DEFAULT_SIMILARITY_THRESHOLD", 0.0)


settings = Settings()
