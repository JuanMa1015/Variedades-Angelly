"""Router para subida de archivos (imagenes de productos)."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from src.api.dependencies import AuthenticatedUser, require_roles

router = APIRouter(tags=["upload"])

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/api/upload-imagen")
async def upload_imagen(
    file: UploadFile,
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
):
    """Sube una imagen y retorna la URL pública."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no permitido. Extensiones validas: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")

    with open(filepath, "wb") as f:
        f.write(contents)

    url = f"/uploads/{filename}"
    return JSONResponse(content={"url": url})
