import json
import re
from services.core_engine import _call_gemini_direct

def _snap_source(source: str) -> str:
    if not source:
        return "Aucun"
    source_lower = source.lower()
    
    # Mapping friendly or fuzzy source names to exact filenames in Data/
    if "beers" in source_lower or "ags" in source_lower:
        return "2022 Updated AGS BeersÂ® Criteria For Comment Period 11.10.22.md"
    if "laroche" in source_lower:
        return "Liste de Laroche 2009.md"
    if "ddi" in source_lower:
        return "DDI 2.0.json"
    if "breucker" in source_lower:
        return "DE BREUCKER.md"
    if "arztebl" in source_lower or "dtsch" in source_lower:
        return "Dtsch_Arztebl_Int-107-0543.md"
    if "start" in source_lower or "stopp" in source_lower or "carnet" in source_lower:
        return "carnet_start_stopp_version_01.01.24.md"
    if "mcmillan" in source_lower:
        return "McMillan-Responsible-Geriatric-Presc-Beers-Criteria.md"
    if "pocket" in source_lower or "printable" in source_lower:
        return "PrintableBeersPocketCard.md"
    if "the-beers-list" in source_lower:
        return "The-Beers-List.md"
    if "drug_info" in source_lower:
        return "drug_info.json"
    if "db_drug_interactions" in source_lower:
        return "db_drug_interactions.csv"
        
    return source

def agent3_explication_rapport(drugs_mapped: list[dict], interactions_classified: list[dict], patient_profile: dict, vector_store, prescription_text: str, lang="fr") -> dict:
    """
    Agent 3 : Pharmacien Clinicien Expert.
    Analyse approfondie : Dosage + Contre-indications liÃ©es aux Pathologies.
    """
    
    context = ""
    pathologies = patient_profile.get("pathologies", "Non prÃ©cisÃ©e")
    age = patient_profile.get("age", 30)
    
    print(f"[Agent 3] Analyse ciblee (Dosage pour {age} ans + Pathologies: {pathologies})...")

    context = "\n--- CONTEXTE MÉDICAL DE RÉFÉRENCE ---\n"
    if vector_store:
        for d in drugs_mapped:
            n = d['english_inn']
            query = f"{n} dosage {age} ans contre-indications {pathologies}"
            docs = vector_store.similarity_search(query, k=3)
            for doc in docs:
                source_file = doc.metadata.get('source', 'Source')
                chunk = f"\n=== SOURCE DE RÉFÉRENCE: [{source_file}] ===\n{doc.page_content}\n"
                if chunk not in context:
                    context += chunk
    else:
        context = "Aucune donnée de référence."
    
    prompt = f"""Tu es un PHARMACIEN CLINICIEN EXPERT EN GERIATRIE ET PHARMACOLOGIE HOSPITALIERE. Ton rÃ´le est d'analyser l'ordonnance en prioritÃ© selon les CRITÃˆRES DE BEERS et la LISTE DE LAROCHE.

PROFIL DU PATIENT :
- Nom : {patient_profile.get('nom')}
- Age : {age} ans
- Pathologies : {pathologies}
- Médicaments : {json.dumps(drugs_mapped)}

CONTEXTE MÉDICAL RÉCUPÉRÉ(RAG) :
{context if context.strip() else "Aucune donnÃ©e de rÃ©fÃ©rence spÃ©cifique trouvÃ©e dans la base locale."}

LISTE DES SOURCES DE REFERENCE COMPLÃˆTE (Tu dois choisir exclusivement parmi celles-ci pour le champ "source") :
- 2022 Updated AGS BeersÂ® Criteria For Comment Period 11.10.22.md
- Liste de Laroche 2009.md
- carnet_start_stopp_version_01.01.24.md
- DE BREUCKER.md
- Dtsch_Arztebl_Int-107-0543.md
- McMillan-Responsible-Geriatric-Presc-Beers-Criteria.md
- PrintableBeersPocketCard.md
- The-Beers-List.md
- DDI 2.0.json
- db_drug_interactions.csv

MISSIONS :
1. ANALYSE DU DOSAGE : Évalue strictement la posologie (quantité/dose) prescrite en comparant avec tes données. Utilise UNIQUEMENT "Sur-dosage", "Sous-dosage", ou "Approprié" pour évaluer la quantité. Fais cette analyse numérique pour tous les médicaments prescrits.
2. CONTRE-INDICATIONS PATHOLOGIQUES : Identifie si un médicament est "Potentiellement Inapproprié" (PIM) spécifiquement pour les pathologies du patient ({pathologies}). Utilise impérativement le contexte RAG fourni.
3. DÉTECTION DE REDONDANCE (CRITIQUE) : Vérifie si plusieurs médicaments dans la liste ont la MÊME MOLÉCULE.
4. RAPPORT CLINIQUE (NOTE DE SYNTHÈSE CLINIQUE DIRECTE ET HUMAINE) :
   - Rédige une note d'analyse clinique courte, directe et sans verbiage d'IA, ressemblant à la note tapée par un pharmacien clinicien hospitalier ou un médecin.
   - Structure la note de la manière suivante :
     Commence directement par "**Note de synthèse clinique :**" suivi de ton paragraphe d'analyse clinique continu.
     Après un double saut de ligne, écris "**Conduite à tenir :**" suivi d'une liste à puces simples (en utilisant `- ` pour chaque puce) listant les propositions thérapeutiques précises et concises.
   - N'utilise AUCUN en-tête complexe (pas de "#", "##", "###"), aucune numérotation de section (pas de "1.", "2.", "3.", "4.").
   - Exclure absolument toute phrase d'introduction robotique d'IA (ex: "Dans ce rapport...", "Après analyse...", "Il convient de noter que..."), de conclusion clichée, de signature (ex: pas de "Le Pharmacien Clinicien") ou de transitions artificielles.
   - N'inclus PAS de bloc d'informations patient (Nom, Âge, Pathologies) car l'interface web s'en charge déjà dans l'en-tête.
   - Intègre de façon naturelle les abréviations médicales françaises classiques : ATCD, tt, CI, AAP, AVK, AINS, poso, PIM, IR/IH/IC, HTA, PEC, bilan biol., NFS.

CONSIGNES DE SÉCURITÉ ABSOLUES :
- Chaque fragment du contexte médical commence par une ligne de titre indiquant sa source exacte, sous le format : `=== SOURCE DE RÉFÉRENCE: [Nom_du_fichier] ===`.
- Tu dois extraire le nom du fichier source exact contenu entre les crochets `[...]` de cette ligne, et le mettre tel quel dans le champ `"source"`.
- Tu ne dois JAMAIS inventer de fichier source ni utiliser de valeur fictive ou générique par défaut pour l'analyse clinique.
- Si les données de dosage d'un médicament ne figurent pas explicitement dans le contexte RAG fourni, tu ne devez PAS l'inclure dans `dosage_analysis`.
- La section `dosage_analysis` évalue les quantités prescrites. Si un médicament ne convient pas du tout au profil du patient (à cause de son âge ou de ses pathologies), tu DOIS le signaler dans la liste `contraindications`. Un médicament peut être analysé dans les deux catégories si nécessaire.
- INTERDICTION FORMELLE : Ne mets JAMAIS d'interactions médicamenteuses (entre deux médicaments) dans la liste `contraindications`. Les interactions sont déjà gérées par un autre système. `contraindications` est STRICTEMENT réservé aux incompatibilités d'un médicament avec l'ÂGE ou les PATHOLOGIES du patient, ou aux redondances.
- Si deux médicaments partagent la même molécule, ajoute-les dans `contraindications` with a severity "MAJEUR". Raison : "Redondance thérapeutique (accumulation de la même molécule)". Source : "Analyse Logique".
- Si aucune contre-indication liée à l'âge ou aux pathologies n'est trouvée, retourne "contraindications": [].

STRUCTURE JSON :
{{
  "report_markdown": "**Note de synthèse clinique :**\n[Rédiger ici l'analyse clinique directe du cas patient et des anomalies de l'ordonnance sous forme de paragraphe rédigé de manière naturelle, humaine et concise]\n\n**Conduite à tenir :**\n- [Première proposition thérapeutique concise]\n- [Deuxième proposition thérapeutique concise]",
  "dosage_analysis": [{{ 
      "médicament": "Utiliser le NOM COMMERCIAL de l'ordonnance (ex: Advil, Sintrom)", 
      "type": "Sur-dosage|Sous-dosage|Approprié", 
      "dose prescrite": "Dose trouvée dans l'ordonnance",
      "dose recommandée": "Dose exacte sécuritaire selon la DATA (ex: < 1200mg/j)",
      "facteur de risque": "Indique si l'âge ou une pathologie aggrave le risque (ex: Insuffisance rénale). Sinon, mettre 'Aucun risque identifié'.",
      "explication": "Description technique directe et concise (ex: poso adaptée au sujet âgé coronaropathe ; risque de majoration des effets indésirables en cas de cumul). Évite absolument les formules d'IA.",
      "source": "Nom du fichier source réel extrait du RAG (ex: Liste de Laroche 2009.md)"
  }}],
  "contraindications": [{{
      "médicament": "NOM COMMERCIAL du médicament seul",
      "raison": "Raison clinique concise liée à l'ÂGE ou à la PATHOLOGIE (ex: PIM : Prévention primaire chez le sujet âgé non recommandée, ou CI absolue chez l'insuffisant rénal). INTERDICTION D'Y METTRE DES INTERACTIONS.",
      "gravité": "MAJEUR",
      "source": "Nom du fichier source réel extrait du RAG (ex: 2022 Updated AGS Beers® Criteria For Comment Period 11.10.22.md)"
  }}]
}}

IMPORTANT : Le contenu de "report_markdown", "explication", "raison", "type" et "gravité" DOIT être écrit entièrement en FRANÇAIS.
Utilise un ton purement médical hospitalier, professionnel et ultra-précis. Pas de politesses ni de verbiage IA.
"""
    
    raw_res = _call_gemini_direct(prompt)
    try:
        match = re.search(r'\{.*\}', raw_res, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            # Normalisation dynamique des noms pour l'affichage final
            name_map = {d['english_inn']: d.get('display_name', d['english_inn']) for d in drugs_mapped}
            
            if 'dosage_analysis' in data:
                for item in data['dosage_analysis']:
                    med_key = 'médicament' if 'médicament' in item else ('mÃ©dicament' if 'mÃ©dicament' in item else 'médicament')
                    if med_key in item:
                        item[med_key] = name_map.get(item[med_key], item[med_key])
                    item['source'] = _snap_source(item.get('source', ''))
            if 'contraindications' in data:
                for item in data['contraindications']:
                    med_key = 'médicament' if 'médicament' in item else ('mÃ©dicament' if 'mÃ©dicament' in item else 'médicament')
                    if med_key in item:
                        item[med_key] = name_map.get(item[med_key], item[med_key])
                    item['source'] = _snap_source(item.get('source', ''))
            return data
    except Exception as e:
        print(f"❌ [Agent 3 Error] : {e}")
        return {}
    return {}
