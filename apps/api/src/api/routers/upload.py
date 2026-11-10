"""Router para subida de archivos (imagenes de productos).

Usa Vercel Blob Storage cuando BLOB_READ_WRITE_TOKEN esta presente,
de lo contrario guarda en disco local (desarrollo).

Toda imagen es re-codificada con Pillow: reduce peso, normaliza el formato
y elimina metadatos (EXIF/GPS) antes de persistirla.
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

from src.api.dependencies import AuthenticatedUser, require_roles

router = APIRouter(tags=["upload"])
logger = logging.getLogger("tienda_angelly")

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
# Contrato verificado contra el codigo del SDK oficial @vercel/blob (v2.9):
# PUT <api>/?pathname=...  con Bearer, x-api-version y x-vercel-blob-access.
BLOB_API = os.environ.get("BLOB_API_URL", "https://vercel.com/api/blob").rstrip("/")
BLOB_API_VERSION = "13"
BLOB_FOLDER = "productos"
LOCAL_UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000  # 5000 x 5000: protege contra "decompression bombs"
MAX_DIMENSION = 1600
JPEG_QUALITY = 82
WEBP_QUALITY = 82

MAGIC_BYTES: dict[bytes, set[str]] = {
    b"\xff\xd8\xff": {".jpg", ".jpeg"},
    b"\x89PNG\r\n\x1a\n": {".png"},
    b"GIF87a": {".gif"},
    b"GIF89a": {".gif"},
    b"RIFF": {".webp"},
}


def _validate_image(contents: bytes, ext: str) -> None:
    for magic, exts in MAGIC_BYTES.items():
        if not contents.startswith(magic) or ext not in exts:
            continue
        # RIFF es un contenedor generico (tambien WAV/AVI): un WebP trae "WEBP" en el byte 8.
        if magic == b"RIFF" and contents[8:12] != b"WEBP":
            continue
        return
    raise HTTPException(
        status_code=400,
        detail="El archivo no es una imagen valida o su extension no coincide con el contenido",
    )


def _exigir_tamano_razonable(contents: bytes) -> None:
    """Rechaza imagenes con demasiados pixeles antes de decodificarlas (abrir es perezoso)."""
    try:
        with Image.open(io.BytesIO(contents)) as img:
            ancho, alto = img.size
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="La imagen esta danada o no se pudo procesar",
        ) from exc
    if ancho * alto > MAX_PIXELS:
        raise HTTPException(status_code=400, detail="La imagen tiene demasiados pixeles (maximo 25 megapixeles)")


def _reencode_image(contents: bytes, ext: str) -> tuple[bytes, str]:
    """Re-codifica la imagen: redimensiona, comprime y borra metadatos.

    Los GIF se conservan tal cual para no perder animaciones.
    Retorna (bytes_finales, content_type).
    """
    _exigir_tamano_razonable(contents)
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

    # Se lee un byte de mas para detectar el exceso sin cargar archivos enormes en memoria.
    contents = await file.read(MAX_FILE_SIZE + 1)
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


def _cliente_http() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=30.0)


async def _upload_to_blob(filename: str, contents: bytes, content_type: str) -> str:
    """Sube la imagen a Vercel Blob (almacenamiento permanente, publico, con CDN)."""
    headers = {
        "authorization": f"Bearer {BLOB_TOKEN}",
        "x-api-version": BLOB_API_VERSION,
        "x-vercel-blob-access": "public",
        "x-content-type": content_type,
        "x-add-random-suffix": "1",
    }
    try:
        async with _cliente_http() as client:
            response = await client.put(
                f"{BLOB_API}/",
                params={"pathname": f"{BLOB_FOLDER}/{filename}"},
                headers=headers,
                content=contents,
            )
    except httpx.HTTPError as exc:
        logger.error("Vercel Blob no respondio: %s", exc)
        raise HTTPException(status_code=502, detail="No se pudo contactar el almacenamiento de imagenes") from exc

    if response.status_code in (401, 403):
        logger.error("Vercel Blob rechazo las credenciales (%s): %s", response.status_code, response.text[:200])
        raise HTTPException(
            status_code=500,
            detail="Vercel Blob rechazo las credenciales. Revisa BLOB_READ_WRITE_TOKEN.",
        )
    if response.status_code >= 400:
        logger.error("Vercel Blob fallo (%s): %s", response.status_code, response.text[:200])
        raise HTTPException(status_code=502, detail="No se pudo guardar la imagen")
    return str(response.json()["url"])


async def _upload_local(filename: str, contents: bytes) -> str:
    os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)
    filepath = LOCAL_UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    return f"/uploads/{filename}"
