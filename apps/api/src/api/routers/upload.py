"""Router para subida de archivos (imagenes de productos).

Usa Vercel Blob Storage cuando BLOB_READ_WRITE_TOKEN esta presente,
de lo contrario guarda en disco local (desarrollo).

Toda imagen es re-codificada con Pillow: reduce peso, normaliza el formato
y elimina metadatos (EXIF/GPS) antes de persistirla.
"""

from __future__ import annotations

import io
import os
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from PIL import Image

from src.api.dependencies import AuthenticatedUser, require_roles

router = APIRouter(tags=["upload"])

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
BLOB_API = "https://api.vercel.com/v1/blob"
LOCAL_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_DIMENSION = 1600
JPEG_QUALITY = 82
WEBP_QUALITY = 82

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


def _reencode_image(contents: bytes, ext: str) -> tuple[bytes, str]:
    """Re-codifica la imagen: redimensiona, comprime y borra metadatos.

    Los GIF se conservan tal cual para no perder animaciones.
    Retorna (bytes_finales, content_type).
    """
    if ext == ".gif":
        return contents, "image/gif"

    try:
        with Image.open(io.BytesIO(contents)) as img:
            img = img.convert("RGB") if ext in {".jpg", ".jpeg"} else img.copy()
            if max(img.size) > MAX_DIMENSION:
                img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

            buffer = io.BytesIO()
            if ext in {".jpg", ".jpeg"}:
                img.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
                content_type = "image/jpeg"
            elif ext == ".png":
                img.save(buffer, format="PNG", optimize=True)
                content_type = "image/png"
            else:  # .webp
                img.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=5)
                content_type = "image/webp"
            return buffer.getvalue(), content_type
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="La imagen esta danada o no se pudo procesar",
        ) from exc


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
    contents, content_type = _reencode_image(contents, ext)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="La imagen sigue superando los 5 MB tras optimizarla")

    filename = f"{uuid.uuid4().hex}{ext}"

    if BLOB_TOKEN:
        url = await _upload_to_blob(filename, contents, content_type)
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
