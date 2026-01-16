import asyncio
import time
from typing import Any, Dict


_state_store: Dict[str, Dict[str, Any]] = {}
_expiry_store: Dict[str, float] = {}
_lock = asyncio.Lock()
_ttl_seconds = 3600


async def init_redis() -> None:
    return None


async def close_redis() -> None:
    return None


async def get_session_state(session_id: str) -> Dict[str, Any]:
    async with _lock:
        expires_at = _expiry_store.get(session_id)
        if expires_at is not None and time.time() > expires_at:
            _expiry_store.pop(session_id, None)
            _state_store.pop(session_id, None)
            return {}
        return dict(_state_store.get(session_id, {}))


async def update_session_state(session_id: str, updates: Dict[str, Any]) -> None:
    async with _lock:
        state = dict(_state_store.get(session_id, {}))
        state.update({k: v for k, v in updates.items() if v is not None})
        _state_store[session_id] = state
        _expiry_store[session_id] = time.time() + _ttl_seconds
