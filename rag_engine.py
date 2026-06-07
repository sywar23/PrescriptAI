import os
import pandas as pd
import json
import unicodedata
import warnings
import logging
import re
# Suppression des logs inutiles
logging.getLogger("transformers").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message="Accessing `__path__` from")

# Chemin absolu vers le dossier vector_store (dans le dossier backend)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VECTOR_STORE_PATH = os.path.join(BASE_DIR, "vector_store")

EMBEDDINGS_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

def normalize_drug_name(name: str) -> str:
    """Standardise le nom : minuscule, sans accents, sans dosage, sans formes galéniques."""
    if not name: return ""
    import unicodedata
    import re
    # Conversion en minuscules
    name = name.lower().strip()
    # Suppression des accents
    name = "".join(c for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) != 'Mn')
    # Suppression des dosages courants (mg, ml, etc.)
    name = re.sub(r'\d+\s*(mg|ml|mcg|g|%)', '', name)
    # Suppression des formes galéniques et termes superflus
    name = re.sub(r'(tablets|capsules|comprimes|gelules|sirop|injection|film-coated|solution|oral|spray|suppository)', '', name)
    # Garder uniquement les caractères alphanumériques de base
    name = re.sub(r'[^a-z0-9 ]', ' ', name)
    # Nettoyage des espaces doubles
    return " ".join(name.split())

def search_csv_direct(d1_norm: str, d2_norm: str, folder_path: str = "Data") -> str:
    """Recherche directe par mots-clés dans les fichiers CSV avec marquage de source."""
    context = ""
    for file in os.listdir(folder_path):
        if file.lower().endswith('.csv'):
            path = os.path.join(folder_path, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        l_low = line.lower()
                        if d1_norm in l_low and d2_norm in l_low:
                            context += f"\n[SOURCE_FILE: {file}]\n{line.strip()}\n"
            except: continue
    return context

def get_embeddings():
    from langchain_community.embeddings import HuggingFaceEmbeddings
    return HuggingFaceEmbeddings(model_name=EMBEDDINGS_MODEL)

def load_vector_store():
    if os.path.exists(VECTOR_STORE_PATH):
        try:
            from langchain_community.vectorstores import FAISS
            embeddings = get_embeddings()
            vs = FAISS.load_local(VECTOR_STORE_PATH, embeddings, allow_dangerous_deserialization=True)
            return vs
        except: return None
    return None

def get_all_known_molecules():
    known_drugs = set()
    folder_path = "Data"
    if not os.path.exists(folder_path): return known_drugs
    for file in os.listdir(folder_path):
        path = os.path.join(folder_path, file)
        try:
            if file.lower().endswith('.csv'):
                df = pd.read_csv(path, on_bad_lines='skip', low_memory=False) 
                for col in df.columns:
                    if any(x in col.lower() for x in ['drug', 'med', 'molecule', 'nom', 'synonym']):
                        vals = df[col].dropna().astype(str).unique()
                        for v in vals: known_drugs.add(normalize_drug_name(v))
            elif file.lower().endswith('.json'):
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                def extract(obj):
                    if isinstance(obj, dict):
                        for k, v in obj.items():
                            if k.lower() in ['name', 'drug', 'molecule', 'nom']:
                                if isinstance(v, str): known_drugs.add(normalize_drug_name(v))
                            extract(v)
                    elif isinstance(obj, list):
                        for i in obj: extract(i)
                extract(data)
        except: continue
    return {d for d in known_drugs if len(d) > 3}

def build_vector_store_from_folder(folder_path: str = "Data"):
    all_chunks = []
    all_metadatas = []
    if not os.path.exists(folder_path): return False, 0
    for file in os.listdir(folder_path):
        path = os.path.join(folder_path, file)
        if file.lower().endswith('.csv'):
            try:
                df = pd.read_csv(path, on_bad_lines='skip', low_memory=False)
                for _, row in df.iterrows():
                    text = " | ".join(f"{col}: {val}" for col, val in row.items() if pd.notna(val))
                    if text.strip():
                        all_chunks.append(text)
                        all_metadatas.append({"source": file})
            except: continue
        elif file.lower().endswith('.json'):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                def extract_json_chunks(obj):
                    if isinstance(obj, dict):
                        text = " | ".join(f"{k}: {v}" for k, v in obj.items() if not isinstance(v, (dict, list)) and v)
                        if text.strip():
                            all_chunks.append(text)
                            all_metadatas.append({"source": file})
                        for v in obj.values():
                            extract_json_chunks(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            extract_json_chunks(item)
                
                extract_json_chunks(data)
            except: continue
        elif file.lower().endswith('.md'):
            try:
                from langchain_text_splitters import RecursiveCharacterTextSplitter
                with open(path, 'r', encoding='utf-8') as f: content = f.read()
                splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
                chunks = splitter.split_text(content)
                for c in chunks:
                    all_chunks.append(c)
                    all_metadatas.append({"source": file})
            except: continue
        elif file.lower().endswith('.md'):
            try:
                from langchain_text_splitters import RecursiveCharacterTextSplitter
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                if content.strip():
                    splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=200)
                    chunks = splitter.split_text(content)
                    for c in chunks:
                        all_chunks.append(c)
                        all_metadatas.append({"source": file})
            except: continue

    if not all_chunks: return False, 0

    
    if os.path.exists(VECTOR_STORE_PATH):
        import shutil
        shutil.rmtree(VECTOR_STORE_PATH)
        
    vs = None
    from langchain_community.vectorstores import FAISS
    embeddings = get_embeddings()
    vs = FAISS.from_texts(all_chunks, embeddings, metadatas=all_metadatas)
    vs.save_local(VECTOR_STORE_PATH)
    
    return True, len(all_chunks)
