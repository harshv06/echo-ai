import base64
import os
from typing import Any, Dict, Optional

import httpx


async def synthesize_speech(text: str, language: Optional[str]) -> Dict[str, Any]:
    api_url = os.getenv("TTS_API_URL", "").strip()
    api_key = os.getenv("TTS_API_KEY", "").strip()
    voice_id = os.getenv("TTS_VOICE_ID", "default")

    if not api_url or not api_key:
        return {}

    payload = {
        "text": text,
        "language": language or "english",
        "voice_id": voice_id,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=1.2) as client:
            response = await client.post(api_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return {}

    audio_url = data.get("audio_url")
    audio_base64 = data.get("audio_base64")

    if audio_url:
        return {"audio_url": audio_url}

    if audio_base64:
        try:
            base64.b64decode(audio_base64)
        except Exception:
            return {}
        return {"audio_stream": audio_base64}

    return {}
