import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from llm_client import generate_suggestion, generate_boundaries
from dotenv import load_dotenv

class AnalyzeBoundariesRequest(BaseModel):
    user_context: str
    date_context: str


load_dotenv()

from websocket import router as websocket_router
from redis_store import init_redis, close_redis


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# Load .env if present so local runs pick up API keys
load_dotenv()

app = FastAPI(title="Echo AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router)



@app.on_event("startup")
async def startup() -> None:
    await init_redis()


@app.on_event("shutdown")
async def shutdown() -> None:
    await close_redis()

@app.post("/analyze-boundaries")
async def analyze_boundaries(request: AnalyzeBoundariesRequest):
    result = await generate_boundaries(request.user_context, request.date_context)
    return {"result": result}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8018))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
