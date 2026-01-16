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
5. **Backend responds** with `voice_suggestion` containing `suggestion_text`.
6. **Browser TTS** (SpeechSynthesis) speaks the suggestion at 1.5x rate.

## Edge Cases

- **Browser unsupported** → user sees a “not supported” screen.
- **Mic permission denied** → error shown in status bar.
- **Network drops** → WebSocket auto-reconnects with backoff.
- **AI speaking** → pause detection is skipped.
- **Cooldown active** → silence detection will not trigger backend calls.
- **SpeechSynthesis unsupported** → suggestion is not spoken (can be surfaced as text).

## Performance Notes

- Snapshot minimization keeps payloads small.
- Native browser TTS reduces latency and avoids external TTS.

