import os
import re
import json
import time
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL_NAME = "gemini-3.1-flash-lite-preview" # Utilisation du modèle spécifique du projet

def _call_gemini_direct(prompt: str) -> str:
    """Appel direct au SDK Gemini avec gestion de retry et quota."""
    if not GOOGLE_API_KEY:
        return "Erreur : Clé API manquante."

    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel(MODEL_NAME)
        
        generation_config = {
            "temperature": 0.0,
            "top_p": 1.0,
            "top_k": 1,
            "max_output_tokens": 8192,
        }
        
        # Désactiver les filtres de sécurité pour l'analyse médicale
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
        
        max_retries = 3
        for i in range(max_retries):
            try:
                response = model.generate_content(
                    prompt,
                    generation_config=generation_config,
                    safety_settings=safety_settings
                )
                
                if response and response.text:
                    return response.text.strip()
                return ""
            except Exception as e:
                err_msg = str(e).lower()
                if ("429" in err_msg or "quota" in err_msg or "limit" in err_msg) and i < max_retries - 1:
                    print(f"Quota atteint, attente de 5s (essai {i+1})...")
                    time.sleep(5)
                    continue
                print(f"[CORE ENGINE ERROR] : {str(e)}")
                break
    except Exception as e:
        print(f"[CORE ENGINE CRITICAL] : {str(e)}")
    
    return ""


