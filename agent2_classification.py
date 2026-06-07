import json
import re
from itertools import combinations
from services.core_engine import _call_gemini_direct
from services.rag_engine import normalize_drug_name, search_csv_direct

def agent2_classification_interactions(drugs_mapped: list[dict], vector_store) -> list[dict]:
    """
    Agent 2 : Classification avec retour des noms de MOLÉCULES uniquement.
    """
    if len(drugs_mapped) < 2:
        return []

    print(f"[Agent 2] Analyse des interactions (Molécules Uniquement)...")
    pairs = list(combinations(drugs_mapped, 2))
    
    global_context = ""
    
    # 1. Vector Search per pair (High Recall)
    if vector_store:
        for d1, d2 in pairs:
            n1 = d1['english_inn']
            n2 = d2['english_inn']
            query = f"interaction {n1} {n2}"
            docs = vector_store.similarity_search(query, k=5)
            for doc in docs:
                src = doc.metadata.get('source', 'Base de données')
                chunk = f"\n=== SOURCE DE RÉFÉRENCE: [{src}] ===\n{doc.page_content}\n"
                if chunk not in global_context:
                    global_context += chunk

    # 2. Direct CSV Search per pair (Still fast because it's local)
    for d1, d2 in pairs:
        n1 = normalize_drug_name(d1['english_inn'])
        n2 = normalize_drug_name(d2['english_inn'])
        
        direct_context = search_csv_direct(n1, n2)
        if direct_context:
            global_context += f"\n--- DONNÉES CSV POUR {d1['english_inn']} + {d2['english_inn']} ---\n{direct_context}"
    
    prompt = f"""Tu es un expert en pharmacologie clinique hospitalière. Analyse les interactions pour ces paires : {', '.join([f"{p[0]['english_inn']}+{p[1]['english_inn']}" for p in pairs])}
    
    CONTEXTE MÉDICAL RÉCUPÉRÉ (AVEC SOURCES) :
    {global_context if global_context.strip() else "AUCUNE DONNÉE TROUVÉE DANS LA BASE LOCALE."}
    
    CONSIGNES :
    1. Base-toi EXCLUSIVEMENT sur le CONTEXTE MÉDICAL ci-dessus.
    2. Pour chaque paire, identifie la SOURCE exacte.
    3. Si une interaction n'est pas dans le contexte, mets "severity": "ANONYME" et "source": "Aucun".
    4. Retourne un JSON (liste d'objets) avec : 
       - drug_a, drug_b (Utilise UNIQUEMENT le nom de la MOLÉCULE)
       - severity (MAJEUR, MODÉRÉ, MINEUR, ANONYME)
       - explanation (français, rédigé sous forme de note clinique concise d'une ligne maximum. BANNIS TOUTES les expressions typiques de l'IA comme "Il convient de noter", "Cette association est importante car", etc. Utilise des abréviations médicales françaises si nécessaire comme AVK, AINS, AAP, HTA, IR, etc. Ex: 'Risque de majoration de l'effet anticoagulant par synergie pharmacodynamique. Suivi INR clinique requis.')
       - source (Le NOM DU FICHIER source ou "Aucun")
    """
    
    res = _call_gemini_direct(prompt)
    results = []
    try:
        match = re.search(r'\[.*\]', res, re.DOTALL)
        if match:
            results = json.loads(match.group(0))
    except: pass

    final_results = []
    for d1, d2 in pairs:
        found = False
        n_d1 = normalize_drug_name(d1['english_inn'])
        n_d2 = normalize_drug_name(d2['english_inn'])
        
        for r in results:
            ra = normalize_drug_name(str(r.get("drug_a", "")))
            rb = normalize_drug_name(str(r.get("drug_b", "")))
            
            if (ra == n_d1 and rb == n_d2) or (ra == n_d2 and rb == n_d1):
                severity = r.get("severity", "ANONYME")
                final_results.append({
                    "drug_a": d1.get('display_name', d1['english_inn']),
                    "drug_b": d2.get('display_name', d2['english_inn']),
                    "severity": severity,
                    "explanation": r.get("explanation", "Analyse effectuée."),
                    "source": r.get("source", "Inconnu") if severity != "ANONYME" else "Aucun"
                })
                found = True
                break
        
        if not found:
            final_results.append({
                "drug_a": d1.get('display_name', d1['english_inn']),
                "drug_b": d2.get('display_name', d2['english_inn']),
                "severity": "ANONYME", 
                "explanation": "Aucune interaction documentée dans les sources fournies.", 
                "source": "Aucun"
            })
            
    return final_results
