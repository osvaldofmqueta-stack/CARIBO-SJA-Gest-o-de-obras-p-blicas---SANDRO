from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AccessProfile


def make_user(role=None, email="person@example.com", active=True):
    User = get_user_model()
    user = User.objects.create_user(
        username=email.replace("@", "-"),
        email=email,
        password="Test-Password-Strong-2026",
    )
    if role:
        AccessProfile.objects.create(
            user=user,
            nome=email.split("@")[0],
            email=email,
            role=role,
            activo=active,
        )
    return user


class RolePermissionTests(TestCase):
    def client_for(self, user=None):
        client = APIClient()
        if user:
            client.force_authenticate(user=user)
        return client

    def test_anonymous_requests_cannot_read_protected_data(self):
        response = self.client_for().get("/api/dashboard")
        self.assertIn(response.status_code, (401, 403))

    def test_each_active_role_can_read_and_restricted_users_cannot_write(self):
        manager = make_user(AccessProfile.Role.GESTOR, "manager@example.com")
        fiscal = make_user(AccessProfile.Role.FISCAL, "fiscal@example.com")
        consultant = make_user(AccessProfile.Role.CONSULTA, "consulta@example.com")

        for user in (manager, fiscal, consultant):
            self.assertEqual(self.client_for(user).get("/api/dashboard").status_code, 200)
            self.assertEqual(self.client_for(user).get("/api/me").status_code, 200)

        for user in (fiscal, consultant):
            obra_response = self.client_for(user).post("/api/obras", {}, format="json")
            self.assertEqual(obra_response.status_code, 403)

        fiscal_visit_response = self.client_for(fiscal).post(
            "/api/fiscalizacoes", {}, format="json"
        )
        consultant_visit_response = self.client_for(consultant).post(
            "/api/fiscalizacoes", {}, format="json"
        )
        self.assertNotEqual(fiscal_visit_response.status_code, 403)
        self.assertEqual(consultant_visit_response.status_code, 403)

    def test_missing_or_inactive_access_profile_is_denied(self):
        unassigned = make_user(email="unassigned@example.com")
        inactive = make_user(
            AccessProfile.Role.FISCAL,
            "inactive@example.com",
            active=False,
        )

        self.assertEqual(self.client_for(unassigned).get("/api/dashboard").status_code, 403)
        self.assertEqual(self.client_for(inactive).get("/api/dashboard").status_code, 403)