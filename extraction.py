from fastapi import APIRouter, HTTPException, UploadFile, File
import os
import shutil

from services.extraction_engine import extract_text_from_pdf

router = APIRouter()

@router.post("/extract")
def extract_pdf(file: UploadFile = File(...)):
    """Extraction de texte depuis un PDF via LlamaCloud"""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Le fichier doit être un PDF.")
        
    try:
        # Create a temporary file to save the upload
        temp_file_path = f"temp_{file.filename}"
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Mock file object for the existing extraction engine
        class MockUploadedFile:
            def __init__(self, path, name):
                self.path = path
                self.name = name
            def read(self):
                with open(self.path, "rb") as f:
                    return f.read()
                    
        print(f"[Extraction] Received PDF: {file.filename}")
        mock_file = MockUploadedFile(temp_file_path, file.filename)
        
        # Call extraction
        print(f"[Extraction] Starting text extraction (LlamaCloud/OCR)...")
        result = extract_text_from_pdf(mock_file)
        print(f"[Extraction] Text extracted successfully ({len(result.get('full_text', ''))} chars).")

        
        # Cleanup
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
            
        return {"text": result.get("full_text", "")}
        
    except Exception as e:
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))
