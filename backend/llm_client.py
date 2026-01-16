import logging
import os
from typing import Any, Dict

import httpx
from urllib.parse import urlencode, urlparse, urlunparse, parse_qs


def _is_gemini_api(api_url: str) -> bool:
    return "generativelanguage.googleapis.com" in api_url


def _with_api_key(api_url: str, api_key: str) -> str:
    parsed = urlparse(api_url)
    query = parse_qs(parsed.query)
    if "key" not in query:
        query["key"] = [api_key]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


logger = logging.getLogger("llm")

PROMPT_TEMPLATE = """You are a friendly conversation coach for a dating app in HINGLISH (hindi and english mixed).
Generate ONE short conversational suggestion to reduce awkwardness and make it more fun and hot.

Guidelines:
- Max 120 words
- Spoken, friendly, non-judgmental tone
- Match detected language style (english, hindi, hinglish)
- Avoid repeating recent topics
- Prefer a light callback to past topics when helpful 
- If flirting, keep it playful , hot and raunchy
- Avoid sensitive or personal advice
- Avoid commands or moral judgments
- Make a new topic to talk about that is fun and hot on dates 

Signals:
language: {language}
silence_frequency: {silence_frequency}
silence_seconds: {silence_seconds}
topic_repetition: {topic_repetition}
sentiment_trend: {sentiment_trend}
engagement_score: {engagement_score}
conversation_health: {conversation_health}
dominant_speaker: {dominant_speaker}
recent_topics: {recent_topics}
current_topics: {current_topics}
confidence_score: {confidence_score}
"""


async def generate_suggestion(context: Dict[str, Any]) -> str:
    api_url = os.getenv("LLM_API_URL", "").strip()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "gemini-2.5-flash")

    if not api_url or not api_key:
        logger.warning("LLM not configured")
        return ""

    prompt = PROMPT_TEMPLATE.format(
        language=context.get("detected_language", "english"),
        silence_frequency=context.get("silence_frequency"),
        silence_seconds=context.get("silence_seconds"),
        topic_repetition=context.get("topic_repetition"),
        sentiment_trend=context.get("sentiment_trend"),
        engagement_score=context.get("engagement_score"),
        conversation_health=context.get("conversation_health"),
        dominant_speaker=context.get("dominant_speaker"),
        recent_topics=context.get("recent_topics"),
        current_topics=context.get("current_topics"),
        confidence_score=context.get("confidence_score"),
    )

    if _is_gemini_api(api_url):
        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 200,
            },
        }
        headers = {"Content-Type": "application/json"}
        request_url = _with_api_key(api_url, api_key)
    else:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a adult dating coach flirt and hot assistant and a huge flirt."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 200,
        }
        headers = {"Authorization": f"Bearer {api_key}"}
        request_url = api_url

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(request_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
    except Exception:
        logger.exception("LLM request failed")
        return ""

    logger.debug("LLM response received")
    return _extract_message(data, api_url)


def _extract_message(data: Dict[str, Any], api_url: str) -> str:
    if _is_gemini_api(api_url):
        candidates = data.get("candidates") or []
        if not candidates:
            logger.warning("LLM response missing candidates")
            return ""
        content = candidates[0].get("content") or {}
        parts = content.get("parts") or []
        if not parts:
            logger.warning("LLM response missing parts")
            return ""
        text = parts[0].get("text") or ""
        return text.strip()

    choices = data.get("choices") or []
    if not choices:
        logger.warning("LLM response missing choices")
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    return content.strip()
