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

## CloudFormation + GitHub Actions

This repo includes CloudFormation and GitHub Actions for repeatable MVP deployments.

Files:

- `infra/cloudformation/bootstrap-github-oidc.yaml`
- `infra/cloudformation/cloudrag-mvp.yaml`
- `.github/workflows/deploy-cloudrag-mvp.yml`
- `.github/workflows/destroy-cloudrag-mvp.yml`
- `scripts/package_lambdas.sh`

The main stack creates the stage-1 RAG backbone:

- S3 raw document bucket
- DynamoDB document metadata table
- DynamoDB process jobs table
- SQS processing queue and DLQ
- RDS PostgreSQL database
- VPC/subnets/security group for the public MVP database
- IAM roles for Lambda
- Lambda functions
- SQS event source mapping for the worker
- HTTP API Gateway routes

It also deploys the code paths for:

- Presigned upload URL generation
- Document metadata/status
- SQS async processing
- PDF/DOCX text extraction
- Chunking
- OpenAI embeddings
- pgvector insertion
- Retrieval
- LLM answer generation with citations

### MVP Networking Note

For the lowest-cost MVP, Lambdas are not placed inside a VPC. That lets them call OpenAI without a NAT Gateway. To let those public Lambdas and the GitHub runner connect to RDS, the workflow accepts `db_ingress_cidr`.

For quick experiments, use:

```text
0.0.0.0/0
```

This is convenient but not production-safe. Delete the stack when done. For production, move RDS private and use Lambda in VPC with NAT Gateway, ECS/Fargate, or another controlled egress design.

### One-Time Bootstrap

Deploy the bootstrap stack once from your local machine or AWS CloudShell. It creates:

- GitHub OIDC deploy role
- S3 artifact bucket for Lambda ZIP files

Example:

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

If your AWS account already has the GitHub OIDC provider, set:

```text
CreateGitHubOidcProvider=false
```

Then get outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name cloudrag-github-bootstrap \
  --region ap-south-1 \
  --query "Stacks[0].Outputs"
```

### GitHub Secrets And Variables

Repository secrets:

```text
AWS_GITHUB_DEPLOY_ROLE_ARN
OPENAI_API_KEY
DB_PASSWORD
```

Repository variables:

```text
CFN_ARTIFACT_BUCKET
```

Do not store AWS access keys if using OIDC. The official `aws-actions/configure-aws-credentials` action recommends OIDC so GitHub receives short-lived AWS credentials instead of long-lived keys.

Sources:

- GitHub OIDC for AWS: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
- AWS credentials action: https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions

### Deploy

In GitHub:

```text
Actions -> Deploy CloudRAG MVP -> Run workflow
```

Recommended inputs for experiments:

```text
stack_name: cloudrag-mvp
region: ap-south-1
project_name: cloudrag
environment_name: mvp
raw_bucket_name: leave blank, or provide a globally unique bucket name
db_ingress_cidr: 0.0.0.0/0
db_instance_class: db.t3.micro
```

The workflow:

1. Runs backend tests.
2. Packages Lambda ZIPs.
3. Uploads ZIPs to the artifact bucket.
4. Deploys CloudFormation.
5. Runs pgvector SQL setup against RDS.
6. Prints stack outputs.

### Destroy

In GitHub:

```text
Actions -> Destroy CloudRAG MVP -> Run workflow
```

This empties the stack-created raw bucket, deletes the stack, and waits for deletion. Use it after experiments to avoid RDS costs.

The artifact bucket from the bootstrap stack is intentionally not deleted by the app stack.

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
