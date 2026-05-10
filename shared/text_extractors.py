from io import BytesIO

import fitz
from docx import Document


def extract_text(file_bytes: bytes, file_extension: str, document_id: str) -> dict:
    extension = file_extension.lower().lstrip(".")
    if extension == "pdf":
        return _extract_pdf(file_bytes, document_id)
    if extension == "docx":
        return _extract_docx(file_bytes, document_id)
    raise ValueError(f"Unsupported file extension: {file_extension}")


def _extract_pdf(file_bytes: bytes, document_id: str) -> dict:
    pages = []
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append({"page_number": index, "text": text})
    return {"document_id": document_id, "pages": pages}


def _extract_docx(file_bytes: bytes, document_id: str) -> dict:
    doc = Document(BytesIO(file_bytes))
    text = "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())
    return {"document_id": document_id, "pages": [{"page_number": 1, "text": text} if text else {"page_number": 1, "text": ""}]}
