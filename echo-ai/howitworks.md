# Frontend: How It Works

The frontend records audio, performs speech recognition locally, detects silence, and sends compressed snapshots to the backend via WebSocket.

## Normal Flow

1. **User taps start** → microphone activates, speech recognition begins.
2. **Speech recognition** updates `recentTurns`, `lastSpokenAt`, and detected language.
3. **Silence detection** monitors `lastSpokenAt`:
   - At `silenceThreshold` (7s), triggers `pause_detected`.
4. **Snapshot sent** to backend includes:
   - `lastTurns` (last 4 turns, no fillers)
   - `lastSpokenAt` (seconds)
   - `detectedLanguage` (`english|hindi`)
   - `confidenceScore` (client stub)
5. **Backend responds** with `voice_suggestion` and audio.
6. **Audio playback** uses a single shared `AudioContext` for low latency.

## Edge Cases

- **Browser unsupported** → user sees a “not supported” screen.
- **Mic permission denied** → error shown in status bar.
- **Network drops** → WebSocket auto-reconnects with backoff.
- **AI speaking** → pause detection is skipped.
- **Cooldown active** → silence detection will not trigger backend calls.
- **Audio stream base64** → decoded into audio chunks and played.
- **Audio URL** → fetched and played as a single chunk (legacy support).

## Performance Notes

- Snapshot minimization keeps payloads small.
- Streaming audio reduces perceived latency.
- Single AudioContext reduces resource usage.

