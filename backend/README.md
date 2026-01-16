# Echo AI Backend (Dating Coach)

This FastAPI backend accepts WebSocket snapshots from a frontend, computes lightweight conversation signals, calls an LLM for a short suggestion, runs safety filtering, and returns TTS audio to the client.

## What it does (end-to-end flow)

1. Frontend runs voice activity detection (VAD), silence detection, and any confidence scoring locally.
2. On a pause or low-confidence moment, frontend sends a **snapshot** to `/ws`.
3. Backend computes derived signals (silence frequency, topic repetition, sentiment trend).
4. Backend **compresses context** into signals (no raw transcript is stored).
5. Backend prompts the LLM for a short, friendly suggestion.
6. Suggestion is safety-filtered and sent to TTS.
7. Backend sends `{ "type": "voice_suggestion", "audio_url" | "audio_stream" }`.

## WebSocket API

### Connect
`ws://<host>:<port>/ws?session_id=<optional>`

### Client → Server (JSON only)
```
{
  "type": "pause_detected",
  "conversation_snapshot": {
    "lastTurns": [
      {"speaker": "user", "text": "..."}, 
      {"speaker": "partner", "text": "..."}
    ],
    "lastSpokenAt": 1737040000,
    "detectedLanguage": "english | hindi | hinglish",
    "confidenceScore": 0.0-1.0
  }
}
```

Notes:
- `lastSpokenAt` and `confidenceScore` are optional but recommended.
- `lastTurns` is used only for **topic signals**; it is not stored.

### Server → Client
```
{
  "type": "voice_suggestion",
  "audio_url": "https://..."
}
```
or
```
{
  "type": "voice_suggestion",
  "audio_stream": "<base64 audio>"
}
```

## Suggestion Triggering

The backend sends a suggestion only if:
- At least 30 seconds since the last suggestion, **and**
- `silence_seconds >= 7` **or** `confidenceScore < 0.8` (when provided)

## Safety & Tone

- Suggestions are **non-explicit**, playful, respectful, and consent-aware.
- No moral judgments or commands.
- Explicit sexual content is filtered out.

## Session State

This build uses an in-memory store with a 1-hour TTL. It is fast but **not** shared across multiple instances.
If you need horizontal scaling, swap back to Redis.

## Performance

- Async I/O throughout
- LLM/TTS calls use short timeouts to keep latency low

## Setup

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Environment Variables

- `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`
- `TTS_API_URL`, `TTS_API_KEY`, `TTS_VOICE_ID`

## Notes for Real-World Use

- This backend does **not** do speech-to-text.
- Frontend should handle audio capture, transcription, and VAD.
- Keep snapshots small and send only what’s needed to reduce latency.
