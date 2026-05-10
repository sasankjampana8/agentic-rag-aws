import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.config import settings
from shared.retrieval_service import retrieve_relevant_chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local pgvector retrieval query.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--document-ids", nargs="*")
    parser.add_argument("--top-k", type=int, default=settings.DEFAULT_TOP_K)
    args = parser.parse_args()

    chunks = retrieve_relevant_chunks(
        user_id=args.user_id,
        query=args.query,
        document_ids=args.document_ids,
        top_k=args.top_k,
    )
    for idx, chunk in enumerate(chunks, start=1):
        preview = (chunk["text"] or "").replace("\n", " ")[:260]
        print(f"\n#{idx} score={chunk['score']:.4f}")
        print(f"document_id={chunk['document_id']} file={chunk.get('file_name')} page={chunk.get('page_number')} chunk={chunk['chunk_id']}")
        print(preview)


if __name__ == "__main__":
    main()
