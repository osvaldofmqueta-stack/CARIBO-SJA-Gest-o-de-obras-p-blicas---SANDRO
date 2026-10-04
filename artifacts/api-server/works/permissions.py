from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import AccessProfile


class HasActiveAccessProfile(BasePermission):
    message = "O seu perfil ainda não foi atribuído ou está inactivo. Contacte um gestor."

    def has_permission(self, request, view) -> bool:
        profile = getattr(request.user, "access_profile", None)
        return bool(profile and profile.activo)


class ManagerOnlyPermission(BasePermission):
    message = "Só um gestor pode gerir os perfis de acesso."

    def has_permission(self, request, view) -> bool:
        profile = getattr(request.user, "access_profile", None)
        return bool(
            request.user.is_authenticated
            and profile
            and profile.activo
            and profile.role == AccessProfile.Role.GESTOR
        )


class ManagerWritePermission(BasePermission):
    message = "Só um gestor pode alterar os dados das obras."

    def has_permission(self, request, view) -> bool:
        user = request.user
        profile = getattr(user, "access_profile", None)
        if not user.is_authenticated or not profile or not profile.activo:
            return False
        if profile.role == AccessProfile.Role.CLIENTE:
            return False
        if request.method in SAFE_METHODS:
            return True
        return profile.role == AccessProfile.Role.GESTOR


class FieldRecordWritePermission(BasePermission):
    message = "O acesso às fiscalizações e ocorrências não está disponível para clientes."

    def has_permission(self, request, view) -> bool:
        user = request.user
        profile = getattr(user, "access_profile", None)
        if not user.is_authenticated or not profile or not profile.activo:
            return False
        if profile.role == AccessProfile.Role.CLIENTE:
            return False
        if request.method in SAFE_METHODS:
            return True
        if profile.role == AccessProfile.Role.GESTOR:
            return True
        if request.method in ("POST", "PUT", "PATCH"):
            return profile.role == AccessProfile.Role.FISCAL
        return False


class ClientOnlyPermission(BasePermission):
    message = "Esta área está disponível apenas para contas de cliente."

    def has_permission(self, request, view) -> bool:
        profile = getattr(request.user, "access_profile", None)
        return bool(
            request.user.is_authenticated
            and profile
            and profile.activo
            and profile.role == AccessProfile.Role.CLIENTE
        )


class ProgressUpdatePermission(BasePermission):
    message = "Só gestores e fiscais podem publicar actualizações de obras."

    def has_permission(self, request, view) -> bool:
        user = request.user
        profile = getattr(user, "access_profile", None)
        if not user.is_authenticated or not profile or not profile.activo:
            return False
        if request.method in SAFE_METHODS:
            return True
        return profile.role in (AccessProfile.Role.GESTOR, AccessProfile.Role.FISCAL)