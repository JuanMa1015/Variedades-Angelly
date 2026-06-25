"""Router para subida de archivos (imagenes de productos).

Usa Vercel Blob Storage cuando BLOB_READ_WRITE_TOKEN esta presente,
de lo contrario guarda en disco local (desarrollo).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from src.api.dependencies import AuthenticatedUser, require_roles

router = APIRouter(tags=["upload"])

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
BLOB_API = "https://api.vercel.com/v1/blob"
LOCAL_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024

MAGIC_BYTES: dict[bytes, set[str]] = {
    b"\xff\xd8\xff": {".jpg", ".jpeg"},
    b"\x89PNG\r\n\x1a\n": {".png"},
    b"GIF87a": {".gif"},
    b"GIF89a": {".gif"},
    b"RIFF": {".webp"},
    b"BM": {".bmp"},
}


def _validate_image(contents: bytes, ext: str) -> None:
    for magic, exts in MAGIC_BYTES.items():
        if contents.startswith(magic):
            if ext in exts or (magic == b"RIFF" and ext == ".webp"):
                return
    raise HTTPException(
        status_code=400,
        detail="El archivo no es una imagen valida o su extension no coincide con el contenido",
    )


@router.post("/api/upload-imagen")
async def upload_imagen(
    file: UploadFile,
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor", "superadmin")),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no permitido. Extensiones validas: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="La imagen supera los 5 MB")

    _validate_image(contents, ext)

    filename = f"{uuid.uuid4().hex}{ext}"

    if BLOB_TOKEN:
        url = await _upload_to_blob(filename, contents, file.content_type or "image/jpeg")
    else:
        url = await _upload_local(filename, contents)

    return JSONResponse(content={"url": url})


async def _upload_to_blob(filename: str, contents: bytes, content_type: str) -> str:
    async with httpx.AsyncClient() as client:
        upload_url = f"{BLOB_API}/upload?filename={filename}"
        response = await client.put(
            upload_url,
            headers={
                "Authorization": f"Bearer {BLOB_TOKEN}",
                "Content-Type": content_type,
            },
            content=contents,
        )
        if response.status_code == 401:
            raise HTTPException(
                status_code=500,
                detail="Token de Vercel Blob invalido. Configura BLOB_READ_WRITE_TOKEN.",
            )
        if response.status_code == 403:
            raise HTTPException(
                status_code=500,
                detail="Sin permisos para escribir en Vercel Blob.",
            )
        response.raise_for_status()
        data = response.json()
        return str(data["url"])


async def _upload_local(filename: str, contents: bytes) -> str:
    os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)
    filepath = LOCAL_UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    return f"/uploads/{filename}"
