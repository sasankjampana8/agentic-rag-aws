CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id
ON document_chunks(user_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_user_document
ON document_chunks(user_id, document_id);
