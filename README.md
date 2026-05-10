# CloudRAG Agent — Serverless RAG MVP

A serverless document RAG system that supports direct S3 uploads, async document processing, chunking, embedding, pgvector retrieval, grounded LLM answers with citations, and a mock Next.js chat interface.

This is MVP 1: the RAG backbone plus a mock chat UI. It intentionally excludes Cognito/auth, web search, LangGraph orchestration, multi-agent workflow, OCR, streaming, reranking, Kubernetes, ECS, Bedrock, and full SaaS multi-tenancy.

## Architecture Flow

Upload URL API -> direct S3 upload -> DynamoDB document metadata -> Start Processing API -> SQS -> worker Lambda -> text extraction -> chunking -> OpenAI embeddings -> PostgreSQL pgvector -> retrieval -> grounded answer with citations.

## Project Structure

```text
agentic-rag-aws/
├── frontend/
├── lambdas/
├── shared/
├── scripts/
├── sql/
├── postman/
├── tests/
├── local_data/
└── local_outputs/
```

## Environment

Copy `.env.example` to `.env` for local work and fill in:

- `OPENAI_API_KEY`
- `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`
- AWS names such as `RAW_BUCKET`, `DOCUMENT_TABLE`, `PROCESS_JOB_TABLE`, and `PROCESS_QUEUE_URL`

Install dependencies:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Local-First Development

Run SQL setup against local PostgreSQL or RDS with the project helper:

```bash
python scripts/setup_pgvector_schema.py
```

Or with `psql`:

```bash
psql "$DATABASE_URL" -f sql/create_pgvector_extension.sql
psql "$DATABASE_URL" -f sql/create_document_chunks_table.sql
psql "$DATABASE_URL" -f sql/create_indexes.sql
```

Check DB connectivity:

```bash
python scripts/test_db_connection.py
```

Process one file locally:

```bash
python scripts/local_process_document.py local_data/raw/sample.pdf \
  --user-id user_123 \
  --document-id doc_local_001
```

Test retrieval:

```bash
python scripts/local_retrieval_test.py \
  --user-id user_123 \
  --query "What is this document about?" \
  --document-ids doc_local_001 \
  --top-k 5
```

Test final answer generation:

```bash
python scripts/local_ask_test.py \
  --user-id user_123 \
  --query "Summarize this document." \
  --document-ids doc_local_001
```

## Mock Chat UI

The Next.js mock frontend lives in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

The UI currently uses mock data and includes:

- Chat workspace
- Document store panel
- Settings panel
- Chat history
- Citation chips

## AWS Resources Required

Use region `ap-south-1` and prefix `cloudrag-mvp`.

- S3 bucket: `cloudrag-mvp-documents-<account-id>-ap-south-1`
- DynamoDB table: `cloudrag_documents`, partition key `document_id`
- DynamoDB table: `cloudrag_process_jobs`, partition key `process_id`
- SQS queue: `cloudrag-processing-queue`
- SQS DLQ: `cloudrag-processing-dlq`
- RDS PostgreSQL with pgvector
- API Gateway HTTP API: `cloudrag-mvp-api`
- Lambda functions for upload URL, document status, start process, process status, worker, retrieval, and ask

## IAM Summary

Use one Lambda execution role per function. Every role needs CloudWatch Logs permissions. Keep service permissions narrow:

- Upload URL: `dynamodb:PutItem` on documents table and `s3:PutObject` on `raw/*`.
- Document Status: `dynamodb:GetItem`, `dynamodb:UpdateItem`, and `s3:GetObject` on `raw/*`.
- Start Process: document read/update, process job put, `s3:GetObject`, and `sqs:SendMessage`.
- Process Status: `dynamodb:GetItem` on process jobs.
- Worker: consume SQS, read raw S3 objects, write processed S3 JSON, update DynamoDB document/job records, and VPC access if RDS is private.
- Retrieval and Ask: CloudWatch Logs, VPC access if RDS is private, and optional Secrets Manager read permissions.

Do not use administrator or full-access managed policies for the MVP.

## API Routes

- `POST /documents/upload-url`
- `GET /documents/{document_id}`
- `POST /documents/{document_id}/process`
- `GET /process/{process_id}/status`
- `POST /retrieval/query`
- `POST /ask`

The Ask API reuses shared retrieval logic directly. It does not call the Retrieval API over HTTP.

## Manual Lambda Deployment Notes

Package each Lambda with the `shared/` directory and installed dependencies. The simple metadata handlers can usually use ZIP packages. The processing worker may be easier as a Lambda container image because `PyMuPDF` and `psycopg` include native dependencies.

Set `PROCESS_QUEUE_URL` for the start process handler. Set `OPENAI_API_KEY` and PostgreSQL variables for worker, retrieval, and ask.

If RDS is private, configure worker, retrieval, and ask Lambdas inside the VPC and attach `AWSLambdaVPCAccessExecutionRole`.

## Postman Test Flow

Import `postman/cloudrag_mvp_collection.json`.

1. Generate upload URL with `POST /documents/upload-url`.
2. Upload the actual file directly to S3 using the returned presigned POST `url` and every returned `fields` value as form-data fields. Add the file as the final form-data file part.
3. Check `GET /documents/{document_id}`.
4. Start async processing with `POST /documents/{document_id}/process`.
5. Poll `GET /process/{process_id}/status`.
6. Query chunks with `POST /retrieval/query`.
7. Generate grounded answer with `POST /ask`.

## Troubleshooting

Upload URL works but S3 upload fails:

- Missing returned form fields in Postman.
- `Content-Type` does not exactly match the presigned policy.
- File size exceeds policy.
- Bucket name mismatch.

Document status does not update to `UPLOADED`:

- File was not uploaded to expected S3 key.
- Lambda lacks `s3:GetObject`.
- `document_id` is wrong.

Processing job stays `QUEUED`:

- SQS trigger is not attached to the worker.
- Worker Lambda permission issue.
- SQS message was not sent.
- Worker errors are visible in CloudWatch.

Worker fails while importing `PyMuPDF` or `psycopg`:

- Lambda package is missing native dependencies.
- Use a Lambda container image or Lambda layer.

Worker cannot connect to RDS:

- Lambda is not in the VPC.
- RDS security group does not allow the Lambda security group.
- Wrong DB endpoint or credentials.
- Subnet or route table issue.

Retrieval returns no chunks:

- Document was not processed successfully.
- pgvector table is empty.
- `user_id` mismatch.
- `document_ids` filter is wrong.
- Similarity threshold is too high.

Ask API returns insufficient context:

- Retrieval returned no chunks.
- Uploaded document content does not contain the answer.
- Prompt context is empty.

## Tests

```bash
pytest
```

Current tests cover validation, chunking, prompt building, and DOCX extraction.

## Future Upgrades

- MVP 2: hybrid search, metadata filters, reranking, chunk previews.
- MVP 3: LangGraph agentic orchestration.
- MVP 4: tools such as calculator, web search, chart/table generation.
- MVP 5: observability with trace IDs, prompt logs, latency, tokens, and cost.
- MVP 6: frontend upload, status, chat, and retrieved chunks panels.
- MVP 7: Cognito auth, user isolation, tenant support.
- MVP 8: SAM/CDK/Terraform, GitHub Actions, Lambda container image builds.

## Portfolio Positioning

CloudRAG Agent: Serverless document RAG backend on AWS with direct S3 uploads, async processing, pgvector retrieval, and citation-grounded LLM answers.

Resume bullet:

Built a serverless RAG backend on AWS using API Gateway, Lambda, S3, DynamoDB, SQS, PostgreSQL pgvector, and OpenAI, supporting direct document uploads, async chunking and embedding, semantic retrieval, and grounded answer generation with citations.
