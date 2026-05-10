import pytest

from shared.validation import ValidationError, sanitize_file_name, validate_upload_payload


def test_sanitize_file_name_removes_path_and_unsafe_chars():
    assert sanitize_file_name("../My File?.pdf") == "My_File_.pdf"


def test_validate_upload_payload_accepts_pdf():
    files = validate_upload_payload(
        {
            "user_id": "user_123",
            "files": [
                {
                    "file_name": "sample.pdf",
                    "content_type": "application/pdf",
                    "file_size_bytes": 100,
                }
            ],
        }
    )
    assert files[0]["file_extension"] == "pdf"


def test_validate_upload_payload_rejects_extension_mismatch():
    with pytest.raises(ValidationError):
        validate_upload_payload(
            {
                "user_id": "user_123",
                "files": [
                    {
                        "file_name": "sample.docx",
                        "content_type": "application/pdf",
                        "file_size_bytes": 100,
                    }
                ],
            }
        )
