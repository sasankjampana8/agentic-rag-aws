from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from shared.config import settings
from shared.logger import get_logger

logger = get_logger(__name__)
client = OpenAI(api_key=settings.OPENAI_API_KEY)


@retry(wait=wait_exponential(min=1, max=20), stop=stop_after_attempt(3), reraise=True)
def _embed_batch(texts: list[str], model: str) -> list[list[float]]:
    response = client.embeddings.create(model=model, input=texts)
    return [item.embedding for item in response.data]


def embed_texts(texts: list[str], model: str = settings.OPENAI_EMBEDDING_MODEL) -> list[list[float]]:
    embeddings = []
    batch_size = settings.EMBEDDING_BATCH_SIZE
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        logger.info("Embedding batch start=%s size=%s model=%s", start, len(batch), model)
        embeddings.extend(_embed_batch(batch, model))
    return embeddings


def embed_query(query: str, model: str = settings.OPENAI_EMBEDDING_MODEL) -> list[float]:
    return embed_texts([query], model=model)[0]


@retry(wait=wait_exponential(min=1, max=20), stop=stop_after_attempt(3), reraise=True)
def generate_answer(system_prompt: str, user_prompt: str, model: str = settings.OPENAI_LLM_MODEL) -> str:
    logger.info("Generating answer with model=%s", model)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content or ""
