import os
from dotenv import load_dotenv
load_dotenv()  # Charger les variables d'environnement en premier
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from routes import analyze, chatbot, extraction, history
from services.rag_engine import load_vector_store

# Variable globale pour le RAG
app_state = {
    "vector_store": None
}

async def load_rag_task():
    try:
        import asyncio
        loop = asyncio.get_running_loop()
        current_dir = os.path.dirname(__file__)
        data_dir = os.path.join(current_dir, "Data")
        print("Background: Loading vector store...")
        from services.rag_engine import load_vector_store, build_vector_store_from_folder
        
        # On charge ce qui existe, sinon on attend un update manuel
        app_state["vector_store"] = await loop.run_in_executor(None, load_vector_store)
        if app_state["vector_store"]:
            print("Success: Vector Store loaded.")
        else:
            print("Vector store missing. Please use 'Actualiser data' in Dashboard.")
    except Exception as e:
        print(f"Error during background loading: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Startup: Starting PrescriptIA API server...")
    import asyncio
    # On lance le chargement en arrière-plan pour ne pas bloquer l'ouverture de l'interface
    asyncio.create_task(load_rag_task())
    yield
    print("Shutdown: Stopping server.")

app = FastAPI(
    title="PrescriptIA API",
    description="API Backend pour la plateforme SaaS PrescriptIA",
    version="2.0.0",
    lifespan=lifespan
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/hello")
async def hello():
    return {"message": "Server is UP"}

# Inclusion des routes
app.include_router(analyze.router, prefix="/api")
app.include_router(chatbot.router, prefix="/api")
app.include_router(extraction.router, prefix="/api")
app.include_router(history.router, prefix="/api")

@app.get("/api/status")
async def get_status():
    """Vérifier l'état du système"""
    return {
        "status": "online",
        "rag_loaded": app_state["vector_store"] is not None
    }

@app.post("/api/update_vector_store")
async def update_vector_store():
    """Forcer la reconstruction du vector store depuis le dossier Data"""
    try:
        from services.rag_engine import build_vector_store_from_folder, load_vector_store
        current_dir = os.path.dirname(__file__)
        data_dir = os.path.join(current_dir, "Data")
        
        print("Manual update: Rebuilding Vector Store...")
        success, count = build_vector_store_from_folder(data_dir)
        
        if success:
            app_state["vector_store"] = load_vector_store()
            return {"success": True, "message": f"Vector store mis à jour avec succès ({count} documents)."}
        else:
            return {"success": False, "message": "Échec de la mise à jour du vector store."}
    except Exception as e:
        return {"success": False, "message": str(e)}

# Servir les fichiers Frontend (doit être après les routes API)
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    print(f"Serving frontend from: {frontend_path}")
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
