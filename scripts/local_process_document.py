import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.chunking import chunk_extracted_text
from shared.config import settings
from shared.openai_service import embed_texts
from shared.pgvector_service import insert_chunks
from shared.text_extractors import extract_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Process one local PDF/DOCX into pgvector.")
    parser.add_argument("file_path")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--file-name")
    parser.add_argument("--file-extension", choices=["pdf", "docx"])
    args = parser.parse_args()

    path = Path(args.file_path)
    file_name = args.file_name or path.name
    extension = args.file_extension or path.suffix.lower().lstrip(".")
    file_bytes = path.read_bytes()

    extracted = extract_text(file_bytes, extension, args.document_id)
    output_dir = ROOT / "local_outputs"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / f"{args.document_id}_extracted_text.json"
    output_path.write_text(json.dumps(extracted, indent=2), encoding="utf-8")

    chunks = chunk_extracted_text(
        extracted,
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    embeddings = embed_texts([chunk["chunk_text"] for chunk in chunks], settings.OPENAI_EMBEDDING_MODEL)
    for chunk, embedding in zip(chunks, embeddings):
        chunk.update(
            {
                "embedding": embedding,
                "embedding_model": settings.OPENAI_EMBEDDING_MODEL,
                "user_id": args.user_id,
                "file_name": file_name,
            }
        )
    insert_chunks(chunks)

    print("Local processing complete")
    print(f"pages extracted: {len(extracted.get('pages', []))}")
    print(f"chunks created: {len(chunks)}")
    print(f"embeddings generated: {len(embeddings)}")
    print(f"chunks inserted: {len(chunks)}")
    print(f"extracted text saved: {output_path}")


if __name__ == "__main__":
    main()
