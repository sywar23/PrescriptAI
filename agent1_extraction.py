import re
import json
from services.core_engine import _call_gemini_direct
from services.rag_engine import normalize_drug_name, get_all_known_molecules

# ---------------------------------------------------------
# ÉTAPE A : Recherche Locale (Candidats potentiels)
# ---------------------------------------------------------
def agent1_local_search(text: str) -> list[str]:
    known_molecules = get_all_known_molecules()
    detected = []
    text_lower = text.lower()
    for mol in known_molecules:
        mol_clean = mol.lower().strip()
        if len(mol_clean) < 3: continue
        if re.search(r'\b' + re.escape(mol_clean) + r'\b', text_lower):
            detected.append(mol.title())
    return sorted(list(set(detected)))

# ---------------------------------------------------------
# ÉTAPE B : IA Pharmacien Clinicien (Extraction Contextuelle)
# ---------------------------------------------------------
def agent1_ai_normalization(text: str, candidate_molecules: list = []) -> list[dict]:
    ref_text = ""
    if candidate_molecules:
        ref_text = f"MOLÉCULES RÉFÉRENCÉES DANS LA DATA : {', '.join(candidate_molecules)}\n"

    prompt = f"""Tu es PHARMACIEN CLINICIEN EXPERT. Analyse cette ordonnance.
Extraie les médicaments prescrits.

{ref_text}
CONSIGNES STRICTES :
1. display_name : Nom commercial exact tel qu'écrit (ex: Doliprane, Lexomil, Atarax).
2. normalized : La MOLÉCULE (DCI) uniquement. (ex: Paracétamol au lieu d'Acetaminophen). C'est ce nom qui sera utilisé pour les interactions.
3. dosage : La dose (ex: 1000mg).

FORMAT JSON :
{{
  "drugs": [
    {{ "display_name": "...", "normalized": "...", "dosage": "..." }}
  ]
}}

TEXTE :
{text}
"""
    res = _call_gemini_direct(prompt)
    try:
        match = re.search(r'\{.*\}', res, re.DOTALL)
        if match:
            return json.loads(match.group(0)).get("drugs", [])
    except: pass
    return []

# ---------------------------------------------------------
# ÉTAPE C : Validation Finale (Intelligence du Pharmacien)
# ---------------------------------------------------------
def agent1_final_validation(candidates: list[dict], text: str) -> list[dict]:
    """
    Le pharmacien vérifie la liste finale pour éliminer les erreurs de lecture (hallucinations).
    """
    if not candidates: return []
    
    prompt = f"""Tu es un PHARMACIEN EXPERT. Voici une liste de médicaments extraits d'une ordonnance.
Certains éléments peuvent être des ERREURS (ex: Date, Nom du patient, mots du texte qui ne sont pas des médicaments).

LISTE À VÉRIFIER (Format JSON) : 
{json.dumps(candidates)}

MISSION :
1. Retourne UNIQUEMENT les médicaments réels et validés. 
2. Supprime tout ce qui est métadonnée ou erreur de détection.
3. NETTOYAGE : Assure-toi que 'display_name' ne contient JAMAIS le dosage (ex: 'Doliprane' et non 'Doliprane 1000mg'). Le dosage doit être uniquement dans la clé 'dosage'.
4. IMPORTANT : Tu DOIS conserver exactement la même structure JSON pour chaque médicament.

FORMAT JSON :
{{ "validated_drugs": [...] }}
"""
    res = _call_gemini_direct(prompt)
    try:
        match = re.search(r'\{.*\}', res, re.DOTALL)
        if match:
            return json.loads(match.group(0)).get("validated_drugs", [])
    except: pass
    return candidates

# ---------------------------------------------------------
# ÉTAPE D : Extraction du Profil Patient
# ---------------------------------------------------------
def agent1_extract_patient_info(text: str) -> dict:
    """
    Extrait les informations du patient (Nom, Âge, Poids, Allergies, Pathologies) 
    directement depuis le texte de l'ordonnance.
    """
    prompt = f"""Tu es un expert en analyse de dossiers médicaux. 
Analyse attentivement le texte suivant pour extraire le profil du patient.

TEXTE :
{text}

MISSIONS :
1. ÂGE : Cherche des mentions comme "85 ans", "né en 1940", "âgé de...". Convertis en nombre. (Défaut: 30 si introuvable).
2. POIDS : Cherche "70kg", "pèse 65 kilos", "Poids: 80". (Défaut: 70 si introuvable).
3. ALLERGIES : Cherche "Allergie à...", "Allergique au...", "Pas de pénicilline". (Défaut: "Aucune").
4. PATHOLOGIES : Cherche les maladies chroniques (Diabète, HTA, Insuffisance rénale, Asthme). (Défaut: "Non précisée").
5. NOM : Cherche le nom du patient (Défaut: "Patient").

RETOURNE UNIQUEMENT UN OBJET JSON :
{{
  "nom": "...",
  "age": ...,
  "poids": ...,
  "pathologies": "...",
  "allergies": "..."
}}
"""
    res = _call_gemini_direct(prompt)
    default_data = {"nom": "Patient", "age": 30, "poids": 70, "pathologies": "Non précisée", "allergies": "Aucune"}
    try:
        match = re.search(r'\{.*\}', res, re.DOTALL)
        if match: 
            extracted = json.loads(match.group(0))
            # S'assurer que les valeurs numériques sont correctes
            if isinstance(extracted.get("age"), str):
                extracted["age"] = int(re.search(r'\d+', extracted["age"]).group()) if re.search(r'\d+', extracted["age"]) else 30
            if isinstance(extracted.get("poids"), str):
                extracted["poids"] = int(re.search(r'\d+', extracted["poids"]).group()) if re.search(r'\d+', extracted["poids"]) else 70
            
            # Merge avec les défauts
            for key in default_data:
                if key not in extracted or extracted[key] is None:
                    extracted[key] = default_data[key]
            return extracted
    except: pass
    return default_data
# ORCHESTRATEUR PRINCIPAL : Agent 1
# ---------------------------------------------------------
def process_prescription(text: str) -> tuple[list[dict], dict, str]:
    """
    Agent 1 : Extraction complète (Drogues + Profil Patient + Médecin) en UN SEUL CALL.
    """
    print("[Agent 1] Extraction des données (Drugs + Pathologies)...")
    import time
    start = time.time()
    locally = agent1_local_search(text)
    ref_text = f"MOLÉCULES RÉFÉRENCÉES DANS LA DATA : {', '.join(locally)}\n" if locally else ""
    
    prompt = f"""Tu es un PHARMACIEN CLINICIEN EXPERT. Analyse cette ordonnance médicale.
{ref_text}

TEXTE DE L'ORDONNANCE :
{text}

MISSIONS :
1. EXTRACTION DES MÉDICAMENTS :
   - display_name : Le nom du médicament EXACTEMENT tel qu'il est écrit dans le texte (ex: si le texte dit "Paracétamol", mets "Paracétamol").
   - english_inn : La MOLÉCULE (DCI) en anglais ET ses synonymes internationaux majeurs séparés par des espaces. Utilise ton intelligence médicale pour inclure les noms américains si nécessaire (ex: si c'est du Paracétamol, écris "Paracetamol Acetaminophen". Si c'est Kardégic, écris "Acetylsalicylic acid Aspirin"). C'est vital pour la recherche RAG.
   - dosage : La posologie trouvée.
2. PROFIL DU PATIENT : Extrait Nom du patient, Nom du médecin, Âge, Pathologies, Allergies.

FORMAT JSON :
{{
  "drugs": [
    {{ "display_name": "...", "english_inn": "...", "dosage": "..." }}
  ],
  "patient": {{ "nom": "...", "age": 0, "pathologies": "...", "allergies": "..." }},
  "medecin": "..."
}}
(IMPORTANT: Use exactly the key "age" without accent for the age).
"""
    res = _call_gemini_direct(prompt)
    
    # Defaults
    drugs = []
    patient = {"nom": "Patient", "age": 30, "poids": 70, "pathologies": "Non précisée", "allergies": "Aucune"}
    doctor = "Inconnu"
    
    try:
        match = re.search(r'\{.*\}', res, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            drugs = data.get("drugs", [])
            patient = data.get("patient", patient)
            doctor = data.get("medecin", "Inconnu")
            
            # Cleaning: Only capitalize for consistency, but keep the name as extracted
            for d in drugs:
                d['display_name'] = d.get('display_name', '').strip()
                d['english_inn'] = d.get('english_inn', '').strip().capitalize()
                # Print for debugging as requested by user
                print(f"   [Drug Found] : '{d['display_name']}' -> Molecule: '{d['english_inn']}'")
            
            drugs.sort(key=lambda x: x.get('english_inn', ''))
    except Exception as e:
        print(f"Error parsing single-call extraction: {e}")


    print(f"[Agent 1] Optimization successful. {len(drugs)} meds found.")
    return drugs, patient, doctor
