import base64
import os
from typing import Any, Dict, Optional

import httpx


async def synthesize_speech(text: str, language: Optional[str]) -> Dict[str, Any]:
    api_url = os.getenv("TTS_API_URL", "").strip()
    api_key = os.getenv("TTS_API_KEY", "").strip()
    voice_id = os.getenv("TTS_VOICE_ID", "default")

    print(f"DEBUG: TTS_API_URL: {api_url}")
    print(f"DEBUG: TTS Voice ID: {voice_id}")
    
    if not api_url or not api_key:
        print("ERROR: Missing TTS API URL or Key")
        return {}

    payload = {
        "text": text,
        "language": language or "english",
        "voice_id": voice_id,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            print(f"DEBUG: Sending TTS request for text: {text[:20]}...")
            response = await client.post(api_url, json=payload, headers=headers)
            print(f"DEBUG: TTS Response Status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            print("DEBUG: TTS Request successful")
    except Exception as e:
        print(f"ERROR: TTS Request failed: {e}")
        return {}

    audio_url = data.get("audio_url")
    audio_base64 = data.get("audio_base64")

    if audio_url:
        print("DEBUG: Received audio_url")
        return {"audio_url": audio_url}

    if audio_base64:
        print("DEBUG: Received audio_base64")
        try:
            base64.b64decode(audio_base64)
        except Exception:
            return {}
        return {"audio_stream": audio_base64}

    print("ERROR: No audio content in response")
    return {}
