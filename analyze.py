from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import traceback

from agents.agent1_extraction import process_prescription
from agents.agent2_classification import agent2_classification_interactions
from agents.agent3_reporting import agent3_explication_rapport
from services.history_manager import save_analysis, find_cached_analysis

router = APIRouter()

class AnalyzeRequest(BaseModel):
    text: str
    lang: str = "fr"

@router.post("/extract_drugs")
def extract_drugs_route(request: AnalyzeRequest):
    """Extrait uniquement les médicaments (Étape 1)"""
    try:
        prescription_text = request.text
        drugs_mapped, patient_profile, doctor_name = process_prescription(prescription_text)
        return {"success": True, "drugs": drugs_mapped, "patient_profile": patient_profile, "doctor": doctor_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze")
def analyze_prescription(request: AnalyzeRequest):
    try:
        prescription_text = request.text.strip()
        lang = request.lang
        
        if not prescription_text or len(prescription_text) < 5:
            raise HTTPException(status_code=400, detail="Texte trop court.")

        # --- CHECK CACHE ---
        cached_result = find_cached_analysis(prescription_text)
        if cached_result:
            print("[Cache] Returning stored result instantly!")
            summary = cached_result.get("summary", {})
            return {
                "success": True,
                "cached": True,
                "drugs": cached_result.get("drugs_full", []), 
                "patient_profile": {
                    "nom": summary.get("patient_name", "Inconnu"),
                    "age": summary.get("patient_age", 30)
                },
                "interactions": cached_result.get("results", []),
                "dosage": cached_result.get("dosage", []),
                "contraindications": cached_result.get("contraindications", []),
                "report_markdown": summary.get("report_md", ""),
                "timestamp": cached_result.get("timestamp")
            }

        from main import app_state
        vector_store = app_state.get("vector_store")
        
        print(f"[Analyze] Starting new analysis (Lang: {lang})...")
        
        # Agent 1 : Extraction
        print("[Analyze] Step 1: Extracting drugs and patient info...")
        drugs_mapped, patient_profile, doctor_name = process_prescription(prescription_text)
        
        if not drugs_mapped:
            print("[Analyze] Warning: No drugs recognized.")
            return {"success": False, "message": "Aucun médicament reconnu."}

        print(f"[Analyze] Found {len(drugs_mapped)} drugs. Moving to Step 2.")

        # Agent 2 : Interactions
        print("[Analyze] Step 2: Checking for clinical interactions...")
        interactions_classified = agent2_classification_interactions(drugs_mapped, vector_store)
        
        # Agent 3 : Rapport complet
        print("[Analyze] Step 3: Generating final medical report...")
        report_data = agent3_explication_rapport(
            drugs_mapped=drugs_mapped,
            interactions_classified=interactions_classified,
            patient_profile=patient_profile,
            vector_store=vector_store,
            prescription_text=prescription_text,
            lang=lang
        )
        
        print("[Analyze] Success: Analysis complete. Sending results to Dashboard.")

        
        # Préparation du résumé
        summary = {
            "n_meds": len(drugs_mapped),
            "inter_alerts": sum(1 for i in interactions_classified if i['severity'] in ["MAJEUR", "MODÉRÉ"]),
            "dosage_alerts": len(report_data.get('dosage_analysis', [])),
            "ci_alerts": len(report_data.get('contraindications', [])),
            "patient_name": patient_profile.get("nom") or patient_profile.get("name") or "Inconnu",
            "patient_age": patient_profile.get("age") or patient_profile.get("âge") or 30,
            "doctor_name": doctor_name,
            "report_md": report_data.get("report_markdown", "")
        }
        
        # Sauvegarde avec RAW_TEXT pour le futur cache
        save_analysis(
            drugs_mapped, 
            interactions_classified, 
            report_data.get('dosage_analysis', []), 
            report_data.get('contraindications', []), 
            summary,
            raw_text=prescription_text
        )
        
        return {
            "success": True,
            "cached": False,
            "drugs": drugs_mapped,
            "patient_profile": patient_profile,
            "interactions": interactions_classified,
            "dosage": report_data.get("dosage_analysis", []),
            "contraindications": report_data.get("contraindications", []),
            "report_markdown": report_data.get("report_markdown", "")
        }

    except Exception as e:
        print("Erreur globale :", str(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
