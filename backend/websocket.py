import json
import logging
import time
from typing import Any, Dict
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from conversation_engine import analyze_snapshot, build_llm_context
from llm_client import generate_suggestion
from redis_store import get_session_state, update_session_state
from safety import filter_suggestion



router = APIRouter()
logger = logging.getLogger("websocket")

SILENCE_TRIGGER_SECONDS = 7
CONFIDENCE_TRIGGER_MIN = 0.8


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    session_id = websocket.query_params.get("session_id") or str(uuid4())
    logger.info("WebSocket connected session_id=%s", session_id)

    try:
        while True:
            raw_msg = await websocket.receive_text()
            logger.debug("Received raw message session_id=%s", session_id)
            try:
                payload = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON payload session_id=%s", session_id)
                await websocket.send_json(
                    {"type": "error", "message": "Invalid JSON payload"}
                )
                continue

            msg_type = payload.get("type")
            if msg_type != "pause_detected":
                logger.warning("Unsupported message type=%s session_id=%s", msg_type, session_id)
                await websocket.send_json(
                    {"type": "error", "message": "Unsupported message type"}
                )
                continue

            snapshot = payload.get("conversation_snapshot") or {}
            now_ts = int(time.time())

            state = await get_session_state(session_id)
            analysis = analyze_snapshot(snapshot, state)
            llm_context = build_llm_context(snapshot, analysis, state)

            silence_seconds = analysis.get("silence_seconds")
            confidence_score = analysis.get("confidence_score")
            if silence_seconds is not None or confidence_score is not None:
                if (silence_seconds is None or silence_seconds < SILENCE_TRIGGER_SECONDS) and (
                    confidence_score is None or confidence_score >= CONFIDENCE_TRIGGER_MIN
                ):
                    logger.info(
                        "Trigger gate not met session_id=%s silence_seconds=%s confidence=%s",
                        session_id,
                        silence_seconds,
                        confidence_score,
                    )
                    continue

            suggestion = await generate_suggestion(llm_context)
            suggestion = filter_suggestion(suggestion, llm_context)
            if not suggestion:
                logger.info("Suggestion filtered/empty session_id=%s", session_id)
                continue

            await websocket.send_json(
                {
                    "type": "voice_suggestion",
                    "suggestion_text": suggestion,
                }
            )
            logger.info("Sent voice_suggestion session_id=%s", session_id)

            await update_session_state(
                session_id,
                {
                    **analysis,
                    "last_suggestion_ts": now_ts,
                },
            )
            logger.debug("Session state updated session_id=%s", session_id)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected session_id=%s", session_id)
        return
    except Exception as exc:
        logger.exception("WebSocket error session_id=%s", session_id)
        await websocket.send_json(
            {"type": "error", "message": "Server error", "details": str(exc)}
        )
