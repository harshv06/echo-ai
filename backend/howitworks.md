# Backend: How It Works

This backend listens for WebSocket snapshots, derives conversation signals, calls an LLM for a short suggestion, runs safety filtering, and returns TTS audio.

## Normal Flow

1. **Client connects** to `/ws` (optional `session_id`).
2. **Client sends** `pause_detected` with a `conversation_snapshot`.
3. **Backend loads session state** (in-memory, TTL 1 hour).
4. **Signal extraction**:
   - `silence_frequency`, `topic_repetition`, `sentiment_trend`, `engagement_score`
   - `silence_seconds` from `lastSpokenAt` (seconds)
   - `confidence_score` (from client or stubbed server-side)
5. **Trigger gate**:
   - 30s cooldown between suggestions
   - Suggest only if `silence_seconds >= 7` or `confidence_score < 0.8`
6. **LLM** generates a short suggestion using compressed signals (no raw transcript stored).
7. **Safety filter** removes unsafe/explicit content.
8. **TTS** generates audio.
9. **Backend responds** with `voice_suggestion` containing `audio_url` or `audio_stream`.

## Edge Cases

- **Invalid JSON** → returns `{ type: "error" }` and continues.
- **Unsupported message type** → returns `{ type: "error" }`.
- **Cooldown active** → ignores the request silently (no suggestion).
- **Missing snapshot fields** → falls back to defaults; may skip suggestion if trigger gate fails.
- **LLM failure/timeout** → no response sent, connection kept alive.
- **TTS failure/timeout** → no response sent, connection kept alive.
- **WebSocket disconnect** → exit handler gracefully.

## Safety Rules

- Suggestions are **non-explicit** and **consent-aware**.
- No sensitive/personal advice.
- No moral judgments or commands.
- Explicit sexual content is filtered out.

## Latency Notes

- LLM and TTS calls are short-timeout and async.
- Context is compressed into signals, no transcript storage.

## Provider Suggestions

- **LLM**: OpenAI `gpt-4o-mini` for low latency and good instruction following.
- **TTS**: ElevenLabs or OpenAI TTS for natural voice and fast response.

