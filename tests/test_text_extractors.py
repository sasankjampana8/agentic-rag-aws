from io import BytesIO

from docx import Document

from shared.text_extractors import extract_text


def test_extract_docx_text():
    buffer = BytesIO()
    doc = Document()
    doc.add_paragraph("Hello CloudRAG")
    doc.save(buffer)
    extracted = extract_text(buffer.getvalue(), "docx", "doc_1")
    assert extracted["document_id"] == "doc_1"
    assert extracted["pages"][0]["page_number"] == 1
    assert "Hello CloudRAG" in extracted["pages"][0]["text"]
