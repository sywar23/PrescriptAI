import os
import json
import google.generativeai as genai

def normalize_text(text: str) -> str:
    """Standardise le texte pour la recherche."""
    if not text: return ""
    import unicodedata
    import re
    text = text.lower().strip()
    text = "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    # Garder uniquement les caractères alphanumériques
    text = re.sub(r'[^a-z0-9 ]', ' ', text)
    return " ".join(text.split())

def search_drug_info_direct(query: str) -> str:
    """Recherche directe dans drug_info.json (Nom et Description)"""
    try:
        current_dir = os.path.dirname(__file__)
        data_path = os.path.join(current_dir, "..", "Data", "drug_info.json")
        if not os.path.exists(data_path):
            print(f"[Chatbot Search] Data file not found at {data_path}")
            return ""
        
        with open(data_path, "r", encoding="utf-8") as f:
            drug_data = json.load(f)
        
        # Normalisation de la requête
        query_norm = normalize_text(query)
        keywords = [w for w in query_norm.split() if len(w) > 3]
        if not keywords: return ""

        print(f"[Chatbot Search] Searching drug_info.json for keywords: {keywords}")
        found_info = []
        for k, v in drug_data.items():
            if not isinstance(v, dict): continue
            
            name = normalize_text(v.get("name", k))
            description = normalize_text(v.get("description", ""))
            
            name_words = set(name.split())
            desc_words = set(description.split())
            
            # Recherche si l'un des mots clés est dans le nom ou la description
            match_score = 0
            for kw in keywords:
                # Partial match bech na9blou l'francais/anglais (ex: warfarine/warfarin)
                if any(kw in nw or (len(nw) > 3 and nw in kw) for nw in name_words): match_score += 10
                if any(kw in dw or (len(dw) > 3 and dw in kw) for dw in desc_words): match_score += 5
            
            if match_score > 0:
                real_name = v.get("name", k)
                real_desc = v.get("description", "")
                found_info.append({
                    "text": f"Médicament: {real_name}\n{real_desc}",
                    "score": match_score
                })
        
        if found_info:
            # Trier par score de pertinence
            found_info.sort(key=lambda x: x["score"], reverse=True)
            top_results = [x["text"] for x in found_info[:3]]
            print(f"[Chatbot Search] Found {len(found_info)} matches, keeping top 3.")
            return f"\n[SOURCE: drug_info.json]\n" + "\n\n".join(top_results)
    except Exception as e:
        print(f"Error in direct search: {e}")
    return ""

def ask_doctor_bot(prompt: str, history: list, lang: str = "fr", vector_store=None) -> dict:
    model = genai.GenerativeModel("gemini-3.1-flash-lite-preview")
    
    # 1. Recherche
    yield "[STATUS]🔍 Recherche dans la base locale..."
    
    # Expansion agressive de la recherche via LLM
    kw_prompt = f"Tu es un expert en pharmacologie. Pour la question suivante, identifie tous les médicaments (noms commerciaux et molécules). Retourne UNIQUEMENT une liste de ces noms séparés par des virgules (ex: Panadol, Paracetamol, Acetaminophen). Si aucun médicament n'est trouvé, retourne 'NONE'.\nQUESTION: {prompt}"
    try:
        search_response = model.generate_content(kw_prompt)
        extracted_drugs = search_response.text.strip().replace("\n", " ").replace("*", "")
        if "NONE" in extracted_drugs.upper(): extracted_drugs = ""
    except: extracted_drugs = ""
    
    search_query = f"{extracted_drugs} {prompt}".strip()
    print(f"[Chatbot Search] Expanded Search Query: {search_query}")

    context = ""
    sources = []
    
    # Direct search
    direct_info = search_drug_info_direct(search_query)
    if direct_info:
        context += direct_info
        sources.append("drug_info.json")
        
    # RAG (FAISS)
    if vector_store:
        results = vector_store.similarity_search_with_score(search_query, k=5)
        for doc, score in results:
            if score < 1.0: # Plus permissif pour les résultats sémantiques
                src = doc.metadata.get('source', 'Inconnu')
                context += f"\n[S:{src}] {doc.page_content}\n"
                if src not in sources: sources.append(src)

    # 4. Prompt système
    yield "[STATUS]📝 Analyse des données locales..."
    
    has_context = bool(context and context.strip())
    print(f"[Chatbot] Context available: {has_context}, length: {len(context)}")
    if has_context:
        print(f"[Chatbot] Context preview: {context[:300]}...")
    
    system_instruction = """Tu es 'Doctor Bot', un assistant STRICTEMENT CLINIQUE.
RÈGLES ABSOLUES :
1. Si le CONTEXTE LOCAL ci-dessous contient des données de médicaments (même en anglais ou sous un autre nom), tu DOIS absolument les utiliser et les traduire pour répondre. Commence ta réponse par [MED_INFO].
2. UNIQUEMENT si le CONTEXTE LOCAL est marqué 'Vide.', réponds : "Désolé, je ne dispose pas d'informations médicales sur ce sujet dans ma base de données locale."
3. NE JAMAIS inventer d'informations. Utilise UNIQUEMENT les données du contexte.
4. Réponds en français (traduis le contexte si besoin), style direct et clair (max 300 caractères).
5. Les noms commerciaux (Panadol, Doliprane) correspondent souvent à des molécules (Paracétamol) — fais le lien."""
    
    final_model = genai.GenerativeModel(
        model_name="gemini-3.1-flash-lite-preview",
        system_instruction=system_instruction
    )
    
    gemini_history = []
    for m in history:
        gemini_history.append({"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]})
        
    chat = final_model.start_chat(history=gemini_history)
    
    if has_context:
        actual_prompt = f"CONTEXTE LOCAL (données trouvées dans la base):\n{context}\n\nQUESTION DE L'UTILISATEUR: {prompt}\n\nIMPORTANT: Des données ont été trouvées ci-dessus. Utilise-les pour répondre avec [MED_INFO]."
    else:
        actual_prompt = f"CONTEXTE LOCAL: Vide.\n\nQUESTION DE L'UTILISATEUR: {prompt}"

    full_response_text = ""
    try:
        response = chat.send_message(actual_prompt, stream=True)
        for chunk in response:
            try:
                if chunk.text:
                    full_response_text += chunk.text
                    yield chunk.text
            except: continue
        
        # --- BLOC FINAL (Sources & Score) ---
        try:
            is_medical = "[MED_INFO]" in full_response_text
            if sources and is_medical:
                score = min(70 + (len(sources) * 7), 98)
                yield f"\n\n|SOURCES|{','.join(sources)}|CONFIDENCE|{score}"
            else:
                yield f"\n\n|SOURCES||CONFIDENCE|0"
        except:
            yield f"\n\n|SOURCES||CONFIDENCE|0"
            
    except Exception as e:
        print(f"Chatbot Exception: {e}")
        yield "Désolé, une erreur est survenue."
