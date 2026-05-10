from shared.prompt_builder import build_citations, build_context_from_chunks, build_system_prompt, build_user_prompt


def test_prompt_builder_includes_context_and_query():
    chunks = [
        {
            "chunk_id": "chunk_1",
            "document_id": "doc_1",
            "file_name": "sample.pdf",
            "page_number": 2,
            "score": 0.8,
            "text": "Important fact.",
        }
    ]
    context = build_context_from_chunks(chunks)
    prompt = build_user_prompt("What matters?", context)
    assert "Important fact." in prompt
    assert "What matters?" in prompt
    assert "provided document context" in build_system_prompt()
    assert build_citations(chunks)[0]["chunk_id"] == "chunk_1"
