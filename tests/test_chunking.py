from shared.chunking import chunk_extracted_text


def test_chunk_extracted_text_creates_ordered_chunks():
    extracted = {"document_id": "doc_1", "pages": [{"page_number": 1, "text": "alpha beta gamma delta epsilon"}]}
    chunks = chunk_extracted_text(extracted, chunk_size=12, chunk_overlap=3)
    assert len(chunks) >= 2
    assert chunks[0]["document_id"] == "doc_1"
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["page_number"] == 1
