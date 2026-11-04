import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework.exceptions import APIException, ValidationError


MAX_PHOTO_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
SIDECAR_ENDPOINT = os.environ.get(
    "REPLIT_SIDECAR_ENDPOINT",
    "http://127.0.0.1:1106",
).rstrip("/")


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = (
        "As fotografias precisam de armazenamento partilhado, que não está "
        "configurado. Configure o App Storage antes de enviar ou abrir fotografias."
    )
    default_code = "storage_unavailable"


def active_storage_backend():
    if os.environ.get("PRIVATE_OBJECT_DIR", "").strip():
        return "object"
    if (
        os.environ.get("CARIBO_LOCAL", "").lower() in {"1", "true", "yes"}
        and not getattr(settings, "CARIBO_SHARED_DATABASE", False)
    ):
        return "local"
    if (
        os.environ.get("DJANGO_DEBUG", "").lower() == "true"
        and not getattr(settings, "CARIBO_SHARED_DATABASE", False)
    ):
        return "local"
    return None


def local_photos_are_shareable():
    return not getattr(settings, "CARIBO_SHARED_DATABASE", False)


def _content_type_from_signature(signature):
    if signature.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if signature.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if signature.startswith(b"RIFF") and signature[8:12] == b"WEBP":
        return "image/webp"
    raise ValidationError(
        {"foto": "Use uma imagem JPEG, PNG ou WebP válida."}
    )


def validate_image_file(uploaded_file):
    if uploaded_file.size <= 0 or uploaded_file.size > MAX_PHOTO_BYTES:
        raise ValidationError(
            {"foto": "Cada fotografia deve ter entre 1 byte e 10 MB."}
        )

    signature = uploaded_file.read(12)
    uploaded_file.seek(0)
    return _content_type_from_signature(signature)


def safe_original_name(value, content_type):
    name = str(value or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)[:255]
    if not name:
        name = f"fotografia{ALLOWED_IMAGE_TYPES[content_type]}"
    return name


def _private_object_location(object_path):
    if not isinstance(object_path, str) or not object_path.startswith("/objects/"):
        raise ValidationError({"object_path": "O caminho da fotografia não é válido."})
    relative_path = object_path[len("/objects/") :]
    parts = PurePosixPath(relative_path).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValidationError({"object_path": "O caminho da fotografia não é válido."})

    private_dir = os.environ.get("PRIVATE_OBJECT_DIR", "").strip()
    directory_parts = [part for part in private_dir.strip("/").split("/") if part]
    if not directory_parts:
        raise StorageUnavailable()
    bucket_name = directory_parts[0]
    object_prefix = "/".join(directory_parts[1:])
    object_name = "/".join(filter(None, (object_prefix, relative_path)))
    return bucket_name, object_name


def _signed_object_url(object_path, method, ttl_seconds):
    bucket_name, object_name = _private_object_location(object_path)
    payload = json.dumps(
        {
            "bucket_name": bucket_name,
            "object_name": object_name,
            "method": method,
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            ).isoformat(),
        }
    ).encode("utf-8")
    request = Request(
        f"{SIDECAR_ENDPOINT}/object-storage/signed-object-url",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise StorageUnavailable() from exc
    signed_url = result.get("signed_url")
    if not isinstance(signed_url, str) or not signed_url.startswith("https://"):
        raise StorageUnavailable()
    return signed_url


def create_object_upload(obra_id, content_type):
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise ValidationError({"content_type": "O formato da imagem não é permitido."})
    relative_path = f"obra-actualizacoes/{obra_id}/{uuid.uuid4().hex}{extension}"
    object_path = f"/objects/{relative_path}"
    return {
        "backend": "object",
        "object_path": object_path,
        "upload_url": _signed_object_url(object_path, "PUT", 900),
        "content_type": content_type,
    }


def verify_object_upload(object_path, expected_content_type):
    url = _signed_object_url(object_path, "HEAD", 300)
    request = Request(url, method="HEAD")
    try:
        with urlopen(request, timeout=30) as response:
            size = int(response.headers.get("Content-Length", "0"))
            content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise ValidationError(
            {"fotos": "Não foi possível validar uma fotografia enviada."}
        ) from exc

    signature_url = _signed_object_url(object_path, "GET", 60)
    try:
        with urlopen(Request(signature_url), timeout=30) as response:
            signature = response.read(12)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise ValidationError(
            {"fotos": "Não foi possível validar uma fotografia enviada."}
        ) from exc
    try:
        detected_type = _content_type_from_signature(signature)
    except ValidationError as exc:
        raise ValidationError(
            {"fotos": "Uma fotografia enviada não contém uma imagem válida."}
        ) from exc

    if (
        size <= 0
        or size > MAX_PHOTO_BYTES
        or content_type not in ALLOWED_IMAGE_TYPES
        or content_type != expected_content_type
        or detected_type != expected_content_type
    ):
        raise ValidationError(
            {"fotos": "Uma fotografia excede 10 MB ou tem um formato inválido."}
        )
    return size, content_type


def save_local_photo(obra_id, uploaded_file, content_type):
    extension = ALLOWED_IMAGE_TYPES[content_type]
    name = f"obra-actualizacoes/{obra_id}/{uuid.uuid4().hex}{extension}"
    return default_storage.save(name, uploaded_file)


def verify_local_photo(object_path, expected_content_type):
    if not isinstance(object_path, str):
        raise ValidationError({"fotos": "O caminho da fotografia não é válido."})
    path = PurePosixPath(object_path)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValidationError({"fotos": "O caminho da fotografia não é válido."})
    if not object_path.startswith("obra-actualizacoes/"):
        raise ValidationError({"fotos": "O caminho da fotografia não é válido."})
    if not default_storage.exists(object_path):
        raise ValidationError({"fotos": "Uma fotografia enviada já não existe."})
    size = default_storage.size(object_path)
    if size <= 0 or size > MAX_PHOTO_BYTES:
        raise ValidationError({"fotos": "Cada fotografia deve ter no máximo 10 MB."})
    return size, expected_content_type


def open_local_photo(object_path):
    return default_storage.open(object_path, "rb")


def signed_photo_url(object_path):
    return _signed_object_url(object_path, "GET", 300)