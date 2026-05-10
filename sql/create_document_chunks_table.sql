CREATE TABLE IF NOT EXISTS document_chunks (
    chunk_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    file_name TEXT,
    page_number INT,
    chunk_index INT,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    embedding_model TEXT,
    chunking_strategy TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
