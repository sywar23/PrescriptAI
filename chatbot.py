from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict

from services.doctor_bot_service import ask_doctor_bot
# from main import app_state (déplacé)

router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    lang: str = "fr"

from fastapi.responses import StreamingResponse

@router.post("/chat")
def chat_with_bot(request: ChatRequest):
    """Endpoint pour le Doctor Bot avec Streaming"""
    try:
        from main import app_state
        vector_store = app_state.get("vector_store")
        
        # Convert history to format expected by the service
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
        
        print(f"[Chatbot] Received message: '{request.message[:50]}...'")
        
        # Le service est devenu un générateur
        print("[Chatbot] Searching knowledge base & generating response...")
        generator = ask_doctor_bot(
            prompt=request.message,
            history=history_dicts,
            lang=request.lang,
            vector_store=vector_store
        )

        
        return StreamingResponse(generator, media_type="text/event-stream")
        
    except Exception as e:
        print("Erreur Chatbot :", str(e))
        raise HTTPException(status_code=500, detail=f"Erreur chatbot : {str(e)}")
