import os
from typing import Any, Dict

import httpx


PROMPT_TEMPLATE = """You are a friendly conversation coach for a dating app in HINGLISH (hindi and english mixed).
Generate ONE short conversational suggestion to reduce awkwardness.

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
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    if not api_url or not api_key:
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

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 200,
    }

    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=1.2) as client:
            response = await client.post(api_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return ""

    return _extract_message(data)


def _extract_message(data: Dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    return content.strip()
