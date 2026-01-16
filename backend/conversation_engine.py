import re
import time
from typing import Any, Dict, List


STOPWORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "was",
    "were",
    "i",
    "you",
    "he",
    "she",
    "they",
    "we",
    "it",
    "this",
    "that",
    "these",
    "those",
}

POSITIVE_WORDS = {"great", "nice", "awesome", "good", "love", "like", "fun", "happy"}
NEGATIVE_WORDS = {"bad", "boring", "awkward", "sad", "angry", "hate", "tired"}


def _normalize_text(text: str) -> List[str]:
    tokens = re.findall(r"[a-zA-Z]{3,}", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


def _extract_topics(last_turns: List[Dict[str, Any]]) -> List[str]:
    text = " ".join(turn.get("text", "") for turn in last_turns)
    tokens = _normalize_text(text)
    freq: Dict[str, int] = {}
    for token in tokens:
        freq[token] = freq.get(token, 0) + 1
    topics = sorted(freq, key=freq.get, reverse=True)
    return topics[:5]


def _sentiment_score(last_turns: List[Dict[str, Any]]) -> float:
    text = " ".join(turn.get("text", "") for turn in last_turns).lower()
    if not text:
        return 0.0
    score = 0
    for word in POSITIVE_WORDS:
        score += text.count(word)
    for word in NEGATIVE_WORDS:
        score -= text.count(word)
    return max(min(score / 5.0, 1.0), -1.0)


def _dominant_speaker(last_turns: List[Dict[str, Any]]) -> str:
    counts: Dict[str, int] = {}
    for turn in last_turns:
        speaker = turn.get("speaker")
        if speaker:
            counts[speaker] = counts.get(speaker, 0) + 1
    if not counts:
        return "unknown"
    return max(counts, key=counts.get)


def analyze_snapshot(snapshot: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    last_turns = snapshot.get("lastTurns") or []
    detected_language = snapshot.get("detectedLanguage") or "english"
    confidence_score = snapshot.get("confidenceScore")
    now_ts = int(time.time())
    last_spoken_at = snapshot.get("lastSpokenAt")
    silence_seconds = None
    if isinstance(last_spoken_at, (int, float)):
        # Convert milliseconds to seconds if needed
        if last_spoken_at > 1e11:
            last_spoken_at = last_spoken_at / 1000.0
        silence_seconds = max(0.0, now_ts - float(last_spoken_at))

    pause_timestamps = state.get("pause_timestamps") or []
    pause_timestamps = [ts for ts in pause_timestamps if now_ts - ts < 600]
    pause_timestamps.append(now_ts)

    silence_frequency = min(len(pause_timestamps) / 10.0, 1.0)

    topics = _extract_topics(last_turns)
    recent_topics = state.get("recent_topics") or []
    repeated_topics = [t for t in topics if t in recent_topics]
    topic_repetition = min(len(repeated_topics) / 3.0, 1.0)

    sentiment = _sentiment_score(last_turns)
    last_sentiment = state.get("last_sentiment", 0.0)
    sentiment_trend = max(min(sentiment - last_sentiment, 1.0), -1.0)

    dominant = _dominant_speaker(last_turns)

    engagement_score = max(
        0.0, min(1.0, 0.6 + sentiment * 0.2 - silence_frequency * 0.3 - topic_repetition * 0.2)
    )

    conversation_health = max(
        0.0, min(1.0, 0.5 + engagement_score * 0.5 - silence_frequency * 0.2)
    )

    if confidence_score is None:
        confidence_score = max(
            0.0,
            min(
                1.0,
                0.7 + sentiment * 0.15 + engagement_score * 0.15 - silence_frequency * 0.2,
            ),
        )

    return {
        "pause_timestamps": pause_timestamps,
        "silence_frequency": silence_frequency,
        "silence_seconds": silence_seconds,
        "topic_repetition": topic_repetition,
        "sentiment_trend": sentiment_trend,
        "engagement_score": engagement_score,
        "conversation_health": conversation_health,
        "recent_topics": topics,
        "dominant_speaker": dominant,
        "last_sentiment": sentiment,
        "detected_language": detected_language,
        "confidence_score": confidence_score,
    }


def build_llm_context(
    snapshot: Dict[str, Any], analysis: Dict[str, Any], state: Dict[str, Any]
) -> Dict[str, Any]:
    raw_turns = snapshot.get("lastTurns", [])
    print(f"DEBUG: build_llm_context raw_turns count: {len(raw_turns)}")
    if len(raw_turns) > 0:
        print(f"DEBUG: First turn sample: {raw_turns[0]}")

    transcript_text = "\n".join(
        [f"{t.get('speaker', 'User')}: {t.get('text', '')}" for t in raw_turns]
    )
    print(f"DEBUG: Generated transcript length: {len(transcript_text)}")

    return {
        "detected_language": analysis.get("detected_language") or snapshot.get("detectedLanguage"),
        "conversation_health": analysis.get("conversation_health"),
        "confidence_score": analysis.get("confidence_score"),
        "transcript": transcript_text,
        "last_3_lines": "\n".join(
            [f"{t.get('speaker', 'User')}: {t.get('text', '')}" for t in raw_turns[-3:]]
        ),
    }
