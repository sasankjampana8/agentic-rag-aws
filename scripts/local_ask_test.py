import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.config import settings
from shared.openai_service import generate_answer
from shared.prompt_builder import build_citations, build_context_from_chunks, build_system_prompt, build_user_prompt
from shared.retrieval_service import retrieve_relevant_chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local RAG answer generation.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--document-ids", nargs="*")
    parser.add_argument("--top-k", type=int, default=settings.DEFAULT_TOP_K)
    parser.add_argument("--llm-model", default=settings.OPENAI_LLM_MODEL)
    args = parser.parse_args()

    chunks = retrieve_relevant_chunks(args.user_id, args.query, args.document_ids, args.top_k)
    answer = generate_answer(
        build_system_prompt(),
        build_user_prompt(args.query, build_context_from_chunks(chunks)),
        args.llm_model,
    )
    print("\nAnswer\n------")
    print(answer)
    print("\nCitations\n---------")
    for citation in build_citations(chunks):
        print(citation)


if __name__ == "__main__":
    main()
