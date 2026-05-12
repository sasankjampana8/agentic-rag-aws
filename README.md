# CloudRAG Agent

CloudRAG Agent is a production-style, single chatbot application for document-grounded question answering. It uses AWS serverless services for upload, processing, metadata, queues, and APIs; OpenAI for embeddings and answer generation; and PostgreSQL with pgvector for vector search.

This repository is not a Bedrock project, not a no-code agent builder, and not an agent publishing platform. It is one configurable CloudRAG chatbot that can be deployed, tested, destroyed, and rebuilt while you iterate.

## What This Project Does

CloudRAG supports the end-to-end RAG flow:

```text
User login
  -> document upload URL
  -> direct upload to S3
  -> document metadata in DynamoDB
  -> async processing through SQS
  -> PDF/DOCX text extraction
  -> chunking
  -> OpenAI embeddings
  -> pgvector indexing
  -> retrieval
  -> chat runtime
  -> OpenAI answer with citations
  -> run trace stored in S3
```

The current implementation includes:

- Cognito authentication foundation.
- Direct S3 uploads using presigned POST.
- Async document processing with SQS and Lambda.
- PDF and DOCX text extraction.
- Chunking and OpenAI embedding generation.
- PostgreSQL pgvector storage and retrieval.
- Improved retrieval with candidate expansion, lexical reranking, metadata filters, diversity, and parent-neighbor context.
- Chat, message, run, memory, and trace APIs.
- Async runtime worker for chat messages.
- Internal orchestration for direct, RAG, web, chart, and hybrid routes.
- Mock web/API tool and SVG chart artifact tool.
- OpenTelemetry-style internal trace JSON saved to S3.
- Next.js mock/product UI for upload, process, chat, settings, and traces.
- CloudFormation and GitHub Actions for deploy/destroy.

## What Is Not Included Yet

The project intentionally avoids these for now:

- Bedrock.
- Kubernetes, ECS, or full container orchestration.
- Full SaaS multi-tenancy.
- No-code agent-builder APIs.
- Agent versioning or publishing platform APIs.
- User-uploaded custom tools.
- OCR.
- Streaming responses.
- Advanced production observability platform.
- Production-grade private networking with NAT Gateway.
- Full billing, tenant admin, and enterprise controls.

## Tech Stack

Backend:

- Python 3.13
- AWS Lambda
- API Gateway HTTP API
- S3
- DynamoDB
- SQS
- RDS PostgreSQL
- pgvector
- Cognito
- CloudWatch Logs
- CloudFormation

AI and retrieval:

- OpenAI embeddings
- OpenAI chat completions
- PostgreSQL pgvector

Frontend:

- Next.js
- React
- TypeScript
- lucide-react

Deployment:

- GitHub Actions
- GitHub OIDC to AWS
- CloudFormation
- S3 Lambda artifact bucket

## Repository Structure

```text
agentic-rag-aws/
├── .github/workflows/
│   ├── deploy-cloudrag-mvp.yml
│   └── destroy-cloudrag-mvp.yml
├── docs/
│   └── api_contract.md
├── frontend/
│   ├── app/
│   ├── components/
│   └── package.json
├── infra/cloudformation/
│   ├── bootstrap-github-oidc.yaml
│   └── cloudrag-mvp.yaml
├── lambdas/
│   ├── auth_handler/
│   ├── ask_handler/
│   ├── chat_handler/
│   ├── document_status_handler/
│   ├── memory_handler/
│   ├── process_status_handler/
│   ├── processing_worker/
│   ├── retrieval_handler/
│   ├── run_handler/
│   ├── runtime_worker/
│   ├── start_process_handler/
│   ├── upload_url_handler/
│   └── v1_documents_handler/
├── postman/
├── scripts/
├── shared/
├── sql/
├── tests/
├── requirements.txt
└── requirements-lambda.txt
```

## Architecture

### Document Processing Flow

```text
POST /v1/documents/upload-url
  -> Lambda creates document metadata in DynamoDB
  -> Lambda returns presigned S3 POST data
  -> Client uploads PDF/DOCX directly to S3
  -> POST /v1/documents/{document_id}/process
  -> Lambda creates process job and sends SQS message
  -> processing_worker Lambda downloads file
  -> text extraction
  -> chunking
  -> OpenAI embeddings
  -> pgvector insert
  -> process/document status updated
```

### Chat Runtime Flow

```text
POST /v1/chats
  -> create chat metadata
POST /v1/chats/{chat_id}/messages
  -> store user message
  -> create run
  -> enqueue runtime job
runtime_worker
  -> load chat and memory
  -> route with orchestrator
  -> retrieve chunks if RAG is needed
  -> optionally add mock web/tool context
  -> call OpenAI through model gateway
  -> store assistant response
  -> update run summary
  -> save trace JSON to S3
GET /v1/chats/{chat_id}/messages/{message_id}/response
  -> poll final response
```

## API Overview

The detailed contract lives in [docs/api_contract.md](docs/api_contract.md).

### Auth

```text
POST /v1/auth/signup
POST /v1/auth/confirm
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
```

All protected `/v1` APIs require:

```text
Authorization: Bearer <access_token>
```

After Cognito login, the backend derives `user_id` from JWT claims. New protected APIs should not trust a `user_id` sent in the request body.

### Documents

```text
POST   /v1/documents/upload-url
GET    /v1/documents
GET    /v1/documents/{document_id}
POST   /v1/documents/{document_id}/process
GET    /v1/documents/{document_id}/processes/{process_id}
DELETE /v1/documents/{document_id}
```

### Retrieval

```text
POST /v1/retrieval/query
```

### Chats And Messages

```text
POST /v1/chats
GET  /v1/chats
GET  /v1/chats/{chat_id}
GET  /v1/chats/{chat_id}/messages
POST /v1/chats/{chat_id}/messages
GET  /v1/chats/{chat_id}/messages/{message_id}/response
```

### Memory

```text
GET  /v1/chats/{chat_id}/memory
POST /v1/chats/{chat_id}/memory/summarize
```

### Runs And Observability

```text
GET /v1/runs
GET /v1/runs/{run_id}
GET /v1/runs/{run_id}/trace
GET /v1/observability/summary
GET /v1/observability/errors
```

### Compatibility Routes

The earlier MVP routes still exist for compatibility:

```text
POST /documents/upload-url
GET  /documents/{document_id}
POST /documents/{document_id}/process
GET  /process/{process_id}/status
POST /retrieval/query
POST /ask
```

The product direction is the `/v1` chat flow:

```text
create chat -> send message -> poll response -> inspect run trace
```

## Global Response Format

Newer `/v1` handlers use a consistent envelope:

```json
{
  "request_id": "req_xxx",
  "status": "success",
  "data": {},
  "metadata": {
    "timestamp": "2026-05-12T00:00:00Z",
    "api_version": "v1"
  }
}
```

Errors follow:

```json
{
  "request_id": "req_xxx",
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload.",
    "details": {}
  },
  "metadata": {
    "timestamp": "2026-05-12T00:00:00Z",
    "api_version": "v1"
  }
}
```

## Local Development

Create a Python environment:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create local folders:

```bash
mkdir -p local_data/raw local_data/processed local_outputs
```

Create `.env` from `.env.example` if present, or define these values:

```text
AWS_REGION=ap-south-1
RAW_BUCKET=<bucket-name>
DOCUMENT_TABLE=cloudrag_documents
PROCESS_JOB_TABLE=cloudrag_process_jobs
PROCESS_QUEUE_URL=<sqs-url>

OPENAI_API_KEY=<your-openai-key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_LLM_MODEL=gpt-4.1-mini

PG_HOST=<postgres-host>
PG_PORT=5432
PG_DATABASE=cloudragdb
PG_USER=postgres
PG_PASSWORD=<db-password>

CHUNK_SIZE=800
CHUNK_OVERLAP=120
EMBEDDING_BATCH_SIZE=50
DEFAULT_TOP_K=5
```

### Setup pgvector Schema

```bash
python scripts/setup_pgvector_schema.py
```

This runs:

```text
sql/create_pgvector_extension.sql
sql/create_document_chunks_table.sql
sql/create_indexes.sql
```

### Test Database Connection

```bash
python scripts/test_db_connection.py
```

### Process A Local Document

```bash
python scripts/local_process_document.py \
  local_data/raw/sample.pdf \
  --user-id user_123 \
  --document-id doc_local_001 \
  --file-name sample.pdf \
  --file-extension pdf
```

### Test Retrieval Locally

```bash
python scripts/local_retrieval_test.py \
  --user-id user_123 \
  --query "What is this document about?" \
  --document-ids doc_local_001 \
  --top-k 5
```

### Test Ask Locally

```bash
python scripts/local_ask_test.py \
  --user-id user_123 \
  --query "Summarize this document." \
  --document-ids doc_local_001
```

## Frontend

The frontend lives in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

The UI supports:

- Cognito signup/login/confirm flow.
- API base URL configuration.
- Document upload.
- Start processing.
- Process status polling.
- Chat creation.
- Message sending and response polling.
- Citations and trace panel.

Set the default API URL with:

```text
NEXT_PUBLIC_CLOUDRAG_API_BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com/dev
```

If the variable is not set, paste the API URL in the Settings panel.

## CloudFormation Deployment

CloudFormation files:

```text
infra/cloudformation/bootstrap-github-oidc.yaml
infra/cloudformation/cloudrag-mvp.yaml
```

GitHub Actions workflows:

```text
.github/workflows/deploy-cloudrag-mvp.yml
.github/workflows/destroy-cloudrag-mvp.yml
```

### What The Main Stack Creates

The `cloudrag-mvp.yaml` stack creates:

- S3 raw document bucket.
- Cognito User Pool.
- Cognito User Pool Client.
- API Gateway HTTP API.
- JWT authorizer.
- DynamoDB users table.
- DynamoDB documents table.
- DynamoDB process jobs table.
- DynamoDB chats table.
- DynamoDB messages table.
- DynamoDB runs table.
- DynamoDB memory table.
- SQS processing queue and DLQ.
- SQS runtime queue and DLQ.
- RDS PostgreSQL database.
- VPC, subnets, route table, internet gateway, and DB security group.
- Lambda execution roles.
- Lambda functions.
- SQS event source mappings.
- API Gateway routes and integrations.

### Networking Note

For the low-cost MVP, Lambdas are not placed inside a VPC. That avoids needing a NAT Gateway for outbound OpenAI calls.

To allow Lambdas and GitHub Actions to reach RDS, the stack currently creates a publicly accessible RDS instance and accepts a `DbIngressCidr` parameter. For quick experiments, the workflow default can use:

```text
0.0.0.0/0
```

This is convenient for development but not production-safe. For production, move RDS private and use a VPC/NAT/ECS/Fargate design with tighter security groups.

## GitHub Actions Setup

### One-Time Bootstrap

Run the bootstrap stack once:

```bash
aws cloudformation deploy \
  --template-file infra/cloudformation/bootstrap-github-oidc.yaml \
  --stack-name cloudrag-github-bootstrap \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-south-1 \
  --parameter-overrides \
    GitHubOrg=sasankjampana8 \
    GitHubRepo=agentic-rag-aws \
    ArtifactBucketName=cloudrag-mvp-artifacts-285870986996-ap-south-1 \
    CreateGitHubOidcProvider=true
```

If your AWS account already has a GitHub OIDC provider, use:

```text
CreateGitHubOidcProvider=false
```

Read bootstrap outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name cloudrag-github-bootstrap \
  --region ap-south-1 \
  --query "Stacks[0].Outputs"
```

### GitHub Secrets

Set these repository secrets:

```text
AWS_GITHUB_DEPLOY_ROLE_ARN
OPENAI_API_KEY
DB_PASSWORD
```

`AWS_GITHUB_DEPLOY_ROLE_ARN` comes from the bootstrap stack output.

Do not store AWS access keys in GitHub if you are using OIDC. GitHub OIDC gives the workflow short-lived AWS credentials.

### GitHub Variables

Set this repository variable:

```text
CFN_ARTIFACT_BUCKET
```

Example:

```text
cloudrag-mvp-artifacts-285870986996-ap-south-1
```

## Deploy

In GitHub:

```text
Actions -> Deploy CloudRAG MVP -> Run workflow
```

Recommended experiment inputs:

```text
stack_name: cloudrag-mvp
region: ap-south-1
project_name: cloudrag
environment_name: mvp
raw_bucket_name: leave blank
db_ingress_cidr: 0.0.0.0/0
db_instance_class: db.t3.micro
```

The deploy workflow:

1. Checks out the repo.
2. Assumes the AWS deploy role using GitHub OIDC.
3. Installs Python.
4. Runs backend tests.
5. Packages Lambda ZIPs.
6. Uploads Lambda artifacts to S3.
7. Deletes unrecoverable `ROLLBACK_COMPLETE` stack state if needed.
8. Deploys CloudFormation.
9. Runs pgvector SQL setup.
10. Prints stack outputs.

## Destroy

In GitHub:

```text
Actions -> Destroy CloudRAG MVP -> Run workflow
```

The destroy workflow:

1. Assumes the AWS deploy role.
2. Reads the raw document bucket from stack outputs.
3. Empties the raw bucket.
4. Deletes the CloudFormation stack.
5. Waits for stack deletion.

The bootstrap artifact bucket is intentionally not deleted by the app destroy workflow. It is shared deployment infrastructure.

If destroy fails on Cognito, make sure the bootstrap role includes Cognito user-pool/client lifecycle permissions, especially:

```text
cognito-idp:DeleteUserPoolClient
cognito-idp:DeleteUserPool
```

## Lambda Packaging

Use:

```bash
scripts/package_lambdas.sh
```

When packaging from macOS for AWS Lambda, native dependencies must be Linux-compatible. Use:

```bash
LAMBDA_PIP_PLATFORM=manylinux2014_x86_64 \
LAMBDA_PIP_PYTHON_VERSION=3.13 \
scripts/package_lambdas.sh
```

This prevents errors like:

```text
Runtime.ImportModuleError: No module named 'pydantic_core._pydantic_core'
```

For heavier production packaging, use Lambda container images or build ZIPs inside the official AWS Lambda Python container.

## Manual Smoke Test Flow

After deploy, use the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name cloudrag-mvp \
  --region ap-south-1 \
  --query "Stacks[0].Outputs" \
  --output table
```

Then test:

1. Sign up with `/v1/auth/signup`.
2. Confirm with `/v1/auth/confirm`.
3. Login with `/v1/auth/login`.
4. Use `access_token` as `Authorization: Bearer <token>`.
5. Request upload URL with `/v1/documents/upload-url`.
6. Upload file directly to S3 using returned POST fields.
7. Start processing with `/v1/documents/{document_id}/process`.
8. Poll `/v1/documents/{document_id}/processes/{process_id}`.
9. Create chat with `/v1/chats`.
10. Send message with `/v1/chats/{chat_id}/messages`.
11. Poll `/v1/chats/{chat_id}/messages/{message_id}/response`.
12. Inspect trace with `/v1/runs/{run_id}/trace`.

## Postman

Import:

```text
postman/cloudrag_mvp_collection.json
```

Core MVP flow:

1. Generate upload URL.
2. Upload file directly to S3 with form-data.
3. Check document status.
4. Start processing.
5. Poll processing status.
6. Query retrieval.
7. Ask a grounded question.

For `/v1` APIs, add:

```text
Authorization: Bearer <access_token>
```

## IAM Notes

Use least privilege where possible. Do not use `AdministratorAccess` for normal deployment.

Important permission groups:

- S3: raw uploads, processed outputs, traces, artifacts.
- DynamoDB: documents, process jobs, users, chats, messages, runs, memory.
- SQS: processing queue and runtime queue.
- Lambda: create/update/delete functions and event source mappings.
- API Gateway: routes, integrations, stages, authorizers.
- Cognito: user pool and user pool client lifecycle.
- RDS/EC2: PostgreSQL, networking, security groups.
- IAM: role creation and pass role for Lambda execution roles.

The bootstrap GitHub deploy role needs enough permission for CloudFormation to create and destroy all stack resources.

## Troubleshooting

### Upload URL works but S3 upload fails

Possible causes:

- Missing returned form fields.
- `Content-Type` does not exactly match the presigned policy.
- File size exceeds the upload policy.
- Wrong bucket or key.

### Document status does not become `UPLOADED`

Possible causes:

- File was uploaded to the wrong S3 key.
- Lambda lacks `s3:GetObject`.
- Wrong `document_id`.

### Processing job stays `QUEUED`

Possible causes:

- SQS event source mapping is missing.
- Worker Lambda is failing.
- Worker lacks SQS permissions.
- SQS message was not sent.

Check CloudWatch logs for:

```text
/aws/lambda/cloudrag-processing-worker
```

### Lambda import fails

Example:

```text
Runtime.ImportModuleError: No module named 'pydantic_core._pydantic_core'
```

This usually means the ZIP was built on macOS with macOS native wheels. Rebuild with:

```bash
LAMBDA_PIP_PLATFORM=manylinux2014_x86_64 \
LAMBDA_PIP_PYTHON_VERSION=3.13 \
scripts/package_lambdas.sh
```

### Worker cannot connect to RDS

Possible causes:

- RDS security group does not allow the source.
- Wrong DB password.
- RDS is still creating or modifying.
- DB endpoint changed after redeploy.
- RDS was deleted by destroy workflow.

### Retrieval returns no chunks

Possible causes:

- Document processing did not complete.
- pgvector schema was not created.
- `document_chunks` table is empty.
- `user_id` mismatch.
- `document_ids` filter is wrong.
- Retrieval threshold is too high.

### Chat response stays `QUEUED` or `RUNNING`

Possible causes:

- Runtime queue event source mapping is missing.
- Runtime worker Lambda is failing.
- OpenAI API key is missing or invalid.
- RDS connection failed during retrieval.

Check CloudWatch logs for:

```text
/aws/lambda/cloudrag-runtime-worker
```

### Destroy workflow fails

Possible causes:

- Raw bucket was not emptied.
- GitHub deploy role lacks delete permissions for a resource.
- Cognito user pool/client lifecycle permissions are missing.
- CloudFormation stack is stuck in `DELETE_FAILED`.

Check events:

```bash
aws cloudformation describe-stack-events \
  --stack-name cloudrag-mvp \
  --region ap-south-1 \
  --query "StackEvents[0:20].[Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]" \
  --output table
```

## Tests

Run backend tests:

```bash
pytest
```

Run frontend build:

```bash
cd frontend
npm run build
```

## Cost Notes

The main cost-bearing resource is RDS PostgreSQL. Delete the app stack when you are done experimenting:

```text
Actions -> Destroy CloudRAG MVP -> Run workflow
```

The bootstrap artifact bucket can remain, but it may accumulate Lambda ZIP artifacts. Clean old prefixes occasionally if needed.

## Current Production Gaps

Before treating this as production, improve:

- Private RDS networking.
- Secrets Manager for OpenAI and DB credentials.
- Better Lambda packaging through container builds.
- Stronger IAM scoping.
- Real web search provider instead of mock tool.
- More robust chart generation.
- Streaming chat responses.
- Better retry/idempotency strategy.
- Automated evaluation and retrieval quality tests.
- External tracing integration such as Langfuse or OTLP.
- CI checks for frontend and backend together.

## Roadmap

Near-term:

- Harden `/v1/ask` as a compatibility wrapper over chat runtime.
- Improve Postman collection for the `/v1` auth and chat flow.
- Add frontend environment examples.
- Add trace viewer polish in the UI.
- Add cleaner deployment outputs for frontend configuration.

Later:

- Hybrid retrieval.
- Strong reranking.
- Query rewriting.
- Semantic and dynamic chunking.
- Multi-layer caching.
- Tenant isolation.
- Streaming.
- Production observability.
- Private networking.
- CI/CD hardening.

## Portfolio Positioning

Project name:

```text
CloudRAG Agent
```

Short description:

```text
Serverless document RAG chatbot on AWS with direct S3 uploads, async processing, pgvector retrieval, Cognito auth, chat runtime, and citation-grounded OpenAI answers.
```

Resume bullet:

```text
Built a serverless RAG chatbot on AWS using API Gateway, Lambda, S3, DynamoDB, SQS, Cognito, RDS PostgreSQL pgvector, and OpenAI, supporting direct document uploads, async chunking and embedding, semantic retrieval, chat memory, run traces, and grounded answer generation with citations.
```
