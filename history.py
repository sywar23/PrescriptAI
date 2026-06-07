from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.history_manager import load_history, delete_entry, clear_history

router = APIRouter()

@router.get("/history")
async def get_all_history():
    """Récupère tout l'historique"""
    try:
        history = load_history()
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{entry_id}")
async def delete_history_entry(entry_id: str):
    """Supprime une entrée spécifique"""
    try:
        success = delete_entry(entry_id)
        if not success:
            raise HTTPException(status_code=404, detail="Entrée introuvable ou erreur de suppression.")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history")
async def clear_all_history():
    """Efface tout l'historique"""
    try:
        success = clear_history()
        if not success:
            raise HTTPException(status_code=500, detail="Erreur lors de la suppression de l'historique.")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
