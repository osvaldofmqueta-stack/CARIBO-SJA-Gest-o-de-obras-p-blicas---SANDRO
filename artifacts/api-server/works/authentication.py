import hashlib

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


def username_for_email(email: str) -> str:
    normalized = email.strip().casefold()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"email-{digest}"


class EmailBackend(ModelBackend):
    """Authenticate Django accounts by their individual email address."""

    def authenticate(self, request, username=None, password=None, email=None, **kwargs):
        address = (email or username or "").strip()
        if not address or password is None:
            return None

        UserModel = get_user_model()
        users = list(UserModel._default_manager.filter(email__iexact=address)[:2])
        if len(users) != 1:
            # Keep unknown and ambiguous addresses from having a fast failure path.
            UserModel().set_password(password)
            return None

        user = users[0]
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None