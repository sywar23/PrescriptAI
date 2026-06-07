import json
import os
from datetime import datetime
import uuid

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "..", "history.json")

# Ensure the file exists with an empty list if it doesn't
if not os.path.exists(HISTORY_FILE):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception as e:
        print(f"Warning: Could not create history file: {e}")

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading history: {e}")
        return []

def save_analysis(drugs_data, results_list, dosage_list, contra_list, summary, raw_text=""):
    try:
        history = load_history()
        
        # Extract names for display if it's a list of dicts
        display_names = []
        if drugs_data and isinstance(drugs_data[0], dict):
            display_names = [d.get("display_name", d.get("english_inn", "Inconnu")) for d in drugs_data]
        else:
            display_names = drugs_data

        new_entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "drugs": display_names,
            "drugs_full": drugs_data,
            "results": results_list,
            "dosage": dosage_list,
            "contraindications": contra_list,
            "summary": summary,
            "raw_text": raw_text # On stocke le texte pour le cache
        }
        
        history.insert(0, new_entry)
        history = history[:100] # Augmenté à 100 pour plus de cache
        
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        print(f"History & Cache saved successfully.")
        return True
    except Exception as e:
        print(f"❌ Error saving history: {e}")
        return False

def find_cached_analysis(text):
    """Cherche si une analyse identique existe déjà"""
    if not text: return None
    import re
    import unicodedata
    
    def normalize_for_cache(t):
        if not t: return ""
        # Normalise les caractères Unicode (é, è, etc.)
        t = unicodedata.normalize('NFC', t)
        # Minuscule et on remplace tout bloc d'espaces/sauts de ligne par un seul espace
        return re.sub(r'\s+', ' ', t.strip().lower())
        
    try:
        history = load_history()
        clean_text = normalize_for_cache(text)
        for entry in history:
            entry_text = normalize_for_cache(entry.get("raw_text", ""))
            if entry_text == clean_text:
                print(f"[Cache Hit] Ordonnance déjà analysée (ID: {entry['id']})")
                return entry
        return None
    except Exception as e:
        print(f"Warning: Error checking cache: {e}")
        return None
def delete_entry(entry_id):
    try:
        history = load_history()
        new_history = [entry for entry in history if entry["id"] != entry_id]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(new_history, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error deleting entry: {e}")
        return False

def clear_history():
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error clearing history: {e}")
        return False
