import os
import io
import traceback
from llama_parse import LlamaParse

def get_llama_parser():
    """Initialise le parseur LlamaCloud."""
    LLAMA_CLOUD_API_KEY = os.getenv("LLAMA_CLOUD_API_KEY")
    if not LLAMA_CLOUD_API_KEY:
        return None, "❌ Clé LlamaCloud manquante."
    
    try:
        parser = LlamaParse(
            api_key=LLAMA_CLOUD_API_KEY,
            result_type="markdown",
            verbose=True,
            
        )
        return parser, "✅ LlamaCloud prêt"
    except Exception as e:
        return None, f"❌ Erreur LlamaCloud : {str(e)}"

def extract_text_from_pdf(uploaded_file):
    """Extrait le texte d'un PDF via LlamaCloud."""
    parser, msg = get_llama_parser()
    if not parser:
        return {"full_text": "", "error": msg}
    
    try:
        # Sauvegarde temporaire du fichier
        file_bytes = uploaded_file.read()
        file_name = uploaded_file.name
        
        # On peut aussi utiliser directement les bytes si LlamaParse le supporte
        # Sinon on écrit un fichier temporaire
        with open(file_name, "wb") as f:
            f.write(file_bytes)
            
        # Parsing
        documents = parser.load_data(file_name)
        os.remove(file_name) # Cleanup
        
        full_text = "\n".join([doc.text for doc in documents])
        return {"full_text": full_text, "error": None}
    except Exception as e:
        traceback.print_exc()
        return {"full_text": "", "error": str(e)}
