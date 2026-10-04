from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit
from .authentication import username_for_email
from .models import AccessProfile, AuditEvent, Obra
from .permissions import ManagerOnlyPermission


def _profile_for(user):
    return AccessProfile.objects.filter(user_id=user.pk).first()


def _user_data(user, profile=None):
    profile = profile if profile is not None else _profile_for(user)
    obras = (
        list(
            profile.obras.order_by("referencia").values(
                "id",
                "referencia",
                "nome",
            )
        )
        if profile
        else []
    )
    return {
        "user_id": user.pk,
        "name": (
            (profile.nome if profile else "")
            or user.get_full_name()
            or user.email
            or user.get_username()
        ),
        "email": user.email or (profile.email if profile else ""),
        "login_email": user.email,
        "has_login_email": bool(user.email),
        "role": profile.role if profile else None,
        "role_label": profile.get_role_display() if profile else None,
        "activo": profile.activo if profile else False,
        "has_profile": profile is not None,
        "obra_ids": [obra["id"] for obra in obras],
        "obras": obras,
    }


def _profile_snapshot(user, profile):
    return {
        "user_id": user.pk,
        "name": profile.nome,
        "email": user.email or profile.email,
        "role": profile.role,
        "activo": profile.activo,
        "obra_ids": list(
            profile.obras.order_by("id").values_list("id", flat=True)
        ),
    }


def _parse_obra_ids(value):
    if not isinstance(value, list) or len(value) > 100:
        return None, "Seleccione uma ou mais obras válidas."
    obra_ids = []
    for obra_id in value:
        if type(obra_id) is not int or obra_id <= 0 or obra_id in obra_ids:
            return None, "A lista de obras contém identificadores inválidos."
        obra_ids.append(obra_id)
    found_ids = set(Obra.objects.filter(pk__in=obra_ids).values_list("pk", flat=True))
    if found_ids != set(obra_ids):
        return None, "Uma das obras seleccionadas já não existe."
    return obra_ids, None


def _validate_email(value):
    if not isinstance(value, str):
        raise ValidationError("Indique um endereço de e-mail válido.")
    value = value.strip().lower()
    if not value or len(value) > 254:
        raise ValidationError("Indique um endereço de e-mail válido.")
    validate_email(value)
    return value


class AccessUsersView(APIView):
    permission_classes = [ManagerOnlyPermission]

    def get(self, request):
        try:
            limit = min(100, max(1, int(request.query_params.get("limit", 50))))
            offset = max(0, int(request.query_params.get("offset", 0)))
        except (TypeError, ValueError):
            return Response(
                {"detail": "A paginação indicada não é válida."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        query = request.query_params.get("query", "").strip()
        if len(query) > 100:
            return Response(
                {"detail": "A pesquisa não pode exceder 100 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        users = User.objects.all()
        if query:
            users = users.filter(
                Q(email__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(access_profile__email__icontains=query)
                | Q(access_profile__nome__icontains=query)
            )
        users = users.order_by("first_name", "email", "pk")
        total_count = users.count()
        page = list(users[offset : offset + limit])
        profiles = {
            profile.user_id: profile
            for profile in AccessProfile.objects.filter(
                user_id__in=[user.pk for user in page]
            )
        }
        return Response(
            {
                "results": [_user_data(user, profiles.get(user.pk)) for user in page],
                "total_count": total_count,
                "offset": offset,
                "limit": limit,
            }
        )

    def post(self, request):
        required = {"name", "email", "password", "role"}
        allowed = required | {"obra_ids"}
        if (
            not isinstance(request.data, dict)
            or not required.issubset(request.data)
            or not set(request.data).issubset(allowed)
        ):
            return Response(
                {"detail": "Indique nome, e-mail, palavra-passe e perfil."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = request.data.get("name")
        password = request.data.get("password")
        role = request.data.get("role")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 160:
            return Response(
                {"detail": "O nome deve ter entre 1 e 160 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if role not in AccessProfile.Role.values:
            return Response(
                {"detail": "O perfil indicado não é válido."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obra_ids = []
        if role == AccessProfile.Role.CLIENTE:
            obra_ids, obra_error = _parse_obra_ids(request.data.get("obra_ids"))
            if obra_error or not obra_ids:
                return Response(
                    {"detail": obra_error or "Atribua pelo menos uma obra à conta de cliente."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif request.data.get("obra_ids"):
            return Response(
                {"detail": "Só as contas de cliente podem receber obras atribuídas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            email = _validate_email(request.data.get("email"))
        except ValidationError as exc:
            return Response(
                {"detail": " ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(password, str) or not password or len(password) > 1024:
            return Response(
                {"detail": "Indique uma palavra-passe válida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"detail": "Já existe uma conta com este endereço de e-mail."},
                status=status.HTTP_409_CONFLICT,
            )
        user = User(
            username=username_for_email(email),
            email=email,
            first_name=name.strip()[:150],
        )
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return Response(
                {"detail": " ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user.set_password(password)
                user.save()
                profile = AccessProfile.objects.create(
                    user=user,
                    nome=name.strip(),
                    email=email,
                    role=role,
                )
                if obra_ids:
                    profile.obras.set(obra_ids)
                record_audit(
                    request,
                    entity_type="Perfil de acesso",
                    object_id=str(user.pk),
                    action=AuditEvent.Action.CREATE,
                    after=_profile_snapshot(user, profile),
                )
        except IntegrityError:
            return Response(
                {"detail": "Já existe uma conta com este endereço de e-mail."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            _user_data(user, profile),
            status=status.HTTP_201_CREATED,
        )


class AccessUserDetailView(APIView):
    permission_classes = [ManagerOnlyPermission]
    editable_fields = {"role", "activo", "name", "email", "password", "obra_ids"}

    def patch(self, request, user_id):
        if (
            not isinstance(request.data, dict)
            or not request.data
            or not set(request.data).issubset(self.editable_fields)
        ):
            return Response(
                {"detail": "Indique dados válidos para actualizar a conta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if "role" in request.data and request.data["role"] not in AccessProfile.Role.values:
            return Response(
                {"detail": "O perfil indicado não é válido."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        requested_obra_ids = None
        if "obra_ids" in request.data:
            requested_obra_ids, obra_error = _parse_obra_ids(request.data["obra_ids"])
            if obra_error:
                return Response(
                    {"detail": obra_error},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if "activo" in request.data and type(request.data["activo"]) is not bool:
            return Response(
                {"detail": "O estado de acesso deve ser verdadeiro ou falso."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = request.data.get("name")
        if "name" in request.data and (
            not isinstance(name, str) or not name.strip() or len(name.strip()) > 160
        ):
            return Response(
                {"detail": "O nome deve ter entre 1 e 160 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        email = None
        if "email" in request.data:
            try:
                email = _validate_email(request.data["email"])
            except ValidationError as exc:
                return Response(
                    {"detail": " ".join(exc.messages)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        password = request.data.get("password")
        if "password" in request.data and (
            not isinstance(password, str) or not password or len(password) > 1024
        ):
            return Response(
                {"detail": "Indique uma palavra-passe válida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            User = get_user_model()
            user = User.objects.select_for_update().filter(pk=user_id).first()
            if user is None:
                return Response(
                    {"detail": "A conta indicada não existe."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if email is not None and User.objects.filter(
                email__iexact=email
            ).exclude(pk=user.pk).exists():
                return Response(
                    {"detail": "Já existe uma conta com este endereço de e-mail."},
                    status=status.HTTP_409_CONFLICT,
                )

            active_managers = list(
                AccessProfile.objects.select_for_update()
                .filter(role=AccessProfile.Role.GESTOR, activo=True)
                .order_by("pk")
            )
            profile = AccessProfile.objects.select_for_update().filter(user=user).first()
            created = profile is None
            if created and "role" not in request.data:
                return Response(
                    {"detail": "A conta ainda não tem um perfil atribuído."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            before = _profile_snapshot(user, profile) if profile else None
            next_role = request.data.get("role", profile.role if profile else None)
            next_active = request.data.get(
                "activo", profile.activo if profile else True
            )
            if next_role == AccessProfile.Role.CLIENTE:
                if requested_obra_ids is not None:
                    has_client_works = bool(requested_obra_ids)
                else:
                    has_client_works = bool(profile and profile.obras.exists())
                if not has_client_works:
                    return Response(
                        {"detail": "Atribua pelo menos uma obra à conta de cliente."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            elif requested_obra_ids:
                return Response(
                    {"detail": "Só as contas de cliente podem receber obras atribuídas."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            loses_manager_access = bool(
                profile
                and profile.role == AccessProfile.Role.GESTOR
                and profile.activo
                and (
                    next_role != AccessProfile.Role.GESTOR
                    or not next_active
                )
            )
            if loses_manager_access and len(active_managers) <= 1:
                return Response(
                    {"detail": "Não é possível remover o acesso do último gestor activo."},
                    status=status.HTTP_409_CONFLICT,
                )

            if email is not None:
                user.email = email
            if name is not None:
                user.first_name = name.strip()[:150]
            if "password" in request.data:
                try:
                    validate_password(password, user=user)
                except ValidationError as exc:
                    return Response(
                        {"detail": " ".join(exc.messages)},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.set_password(password)
            user_fields = []
            if "password" in request.data:
                user_fields.append("password")
            if email is not None:
                user_fields.append("email")
            if name is not None:
                user_fields.append("first_name")
            if user_fields:
                user.save(update_fields=user_fields)

            if created:
                profile = AccessProfile(
                    user=user,
                    nome=(name.strip() if name is not None else user.get_full_name())[:160],
                    email=user.email,
                    role=next_role,
                    activo=next_active,
                )
                profile.save()
            else:
                profile.role = next_role
                profile.activo = next_active
                if name is not None:
                    profile.nome = name.strip()
                if email is not None:
                    profile.email = email

                profile.save()

            if requested_obra_ids is not None:
                profile.obras.set(requested_obra_ids)
            elif next_role != AccessProfile.Role.CLIENTE:
                profile.obras.clear()
            after = _profile_snapshot(user, profile)
            if before == after and "password" not in request.data:
                return Response(_user_data(user, profile))
            if "password" in request.data:
                after["password_updated"] = True
            record_audit(
                request,
                entity_type="Perfil de acesso",
                object_id=str(user.pk),
                action=(
                    AuditEvent.Action.CREATE if created else AuditEvent.Action.UPDATE
                ),
                before=before,
                after=after,
            )
        return Response(_user_data(user, profile))