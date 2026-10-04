import json

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .audit import record_audit
from .models import AuditEvent


def _body(request):
    if len(request.body) > 16_384:
        return None, "O pedido excede o tamanho permitido."
    try:
        body = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, "Os dados enviados não são válidos."
    if not isinstance(body, dict):
        return None, "Os dados enviados não são válidos."
    return body, None


def _error(message, status=400):
    return JsonResponse({"detail": message}, status=status)


def _session_payload(user):
    profile = getattr(user, "access_profile", None)
    name = (
        (profile.nome if profile else "")
        or user.get_full_name()
        or user.email
        or "Utilizador"
    )
    return {
        "authenticated": True,
        "user": {"id": user.pk, "email": user.email, "name": name},
    }


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


@require_GET
@ensure_csrf_cookie
def auth_session(request):
    response = JsonResponse(
        _session_payload(request.user)
        if request.user.is_authenticated
        else {"authenticated": False}
    )
    response["Cache-Control"] = "no-store"
    return response


@require_POST
@csrf_protect
def auth_login(request):
    body, error = _body(request)
    if error:
        return _error(error)
    email = body.get("email")
    password = body.get("password")
    if (
        not isinstance(email, str)
        or not email.strip()
        or len(email) > 254
        or not isinstance(password, str)
        or not password
        or len(password) > 1024
        or set(body) != {"email", "password"}
    ):
        return _error("Indique um e-mail e uma palavra-passe válidos.")

    user = authenticate(
        request,
        username=email.strip(),
        password=password,
    )
    if user is None:
        return _error("E-mail ou palavra-passe incorrectos.", status=401)

    login(request, user)
    response = JsonResponse(_session_payload(user))
    response["Cache-Control"] = "no-store"
    return response


@require_POST
@csrf_protect
def auth_logout(request):
    logout(request)
    response = JsonResponse({"authenticated": False})
    response["Cache-Control"] = "no-store"
    return response


@require_POST
@csrf_protect
def change_password(request):
    if not request.user.is_authenticated:
        return _error("Inicie sessão para alterar a palavra-passe.", status=401)

    body, error = _body(request)
    if error:
        return _error(error)
    current_password = body.get("current_password")
    new_password = body.get("new_password")
    if (
        not isinstance(current_password, str)
        or not isinstance(new_password, str)
        or not current_password
        or not new_password
        or len(new_password) > 1024
        or set(body) != {"current_password", "new_password"}
    ):
        return _error("Indique a palavra-passe actual e uma nova palavra-passe.")
    if not request.user.check_password(current_password):
        return _error("A palavra-passe actual está incorrecta.", status=400)

    try:
        validate_password(new_password, user=request.user)
    except ValidationError as exc:
        return _error(" ".join(exc.messages))

    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    record_audit(
        request,
        entity_type="Conta",
        object_id=str(request.user.pk),
        action=AuditEvent.Action.UPDATE,
        before={"email": request.user.email},
        after={"password_updated": True},
    )
    update_session_auth_hash(request, request.user)
    return JsonResponse({"detail": "A palavra-passe foi alterada."})