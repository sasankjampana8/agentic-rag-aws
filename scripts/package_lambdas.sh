#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist/lambda"
BUILD_DIR="${ROOT_DIR}/build/lambda"
DEPS_DIR="${BUILD_DIR}/deps"

rm -rf "${DIST_DIR}" "${BUILD_DIR}"
mkdir -p "${DIST_DIR}" "${DEPS_DIR}"

python -m pip install --upgrade pip
python -m pip install -r "${ROOT_DIR}/requirements-lambda.txt" -t "${DEPS_DIR}"

package_lambda() {
  local source_dir="$1"
  local zip_name="$2"
  local work_dir="${BUILD_DIR}/${zip_name%.zip}"

  mkdir -p "${work_dir}"
  cp -R "${DEPS_DIR}/." "${work_dir}/"
  cp -R "${ROOT_DIR}/shared" "${work_dir}/shared"
  cp "${ROOT_DIR}/lambdas/${source_dir}/handler.py" "${work_dir}/handler.py"

  find "${work_dir}" -type d -name "__pycache__" -prune -exec rm -rf {} +
  find "${work_dir}" -type f -name "*.pyc" -delete

  (cd "${work_dir}" && zip -qr "${DIST_DIR}/${zip_name}" .)
}

package_lambda "upload_url_handler" "upload_url_handler.zip"
package_lambda "document_status_handler" "document_status_handler.zip"
package_lambda "start_process_handler" "start_process_handler.zip"
package_lambda "process_status_handler" "process_status_handler.zip"
package_lambda "processing_worker" "processing_worker.zip"
package_lambda "retrieval_handler" "retrieval_handler.zip"
package_lambda "ask_handler" "ask_handler.zip"

echo "Lambda packages written to ${DIST_DIR}"
