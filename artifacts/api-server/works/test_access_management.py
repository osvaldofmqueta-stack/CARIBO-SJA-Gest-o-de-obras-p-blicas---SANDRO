import json

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from .models import AccessProfile, AuditEvent


def make_user(role, email, password="Test-Password-Strong-2026", active=True, legacy_id=""):
    User = get_user_model()
    user = User.objects.create_user(
        username=email.replace("@", "-"),
        email=email,
        password=password,
    )
    profile = AccessProfile.objects.create(
        user=user,
        legacy_auth_id=legacy_id,
        nome=email.split("@")[0],
        email=email,
        role=role,
        activo=active,
    )
    return user, profile


class AccessManagementTests(TestCase):
    def setUp(self):
        self.manager, self.manager_profile = make_user(
            AccessProfile.Role.GESTOR,
            "manager@example.com",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

    def test_manager_lists_individual_accounts_and_access_profiles(self):
        fiscal, _ = make_user(AccessProfile.Role.FISCAL, "fiscal@example.com")
        response = self.client.get("/api/access-users?query=fiscal")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_count"], 1)
        self.assertEqual(response.data["results"][0]["user_id"], fiscal.pk)
        self.assertEqual(response.data["results"][0]["role"], AccessProfile.Role.FISCAL)
        self.assertTrue(response.data["results"][0]["has_login_email"])

    def test_manager_creates_an_individual_account_and_audit_event(self):
        response = self.client.post(
            "/api/access-users",
            {
                "name": "New Account",
                "email": "new.person@example.com",
                "password": "Angola!Secure927",
                "role": AccessProfile.Role.CONSULTA,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        User = get_user_model()
        user = User.objects.get(email="new.person@example.com")
        self.assertTrue(user.check_password("Angola!Secure927"))
        self.assertEqual(
            user.access_profile.role,
            AccessProfile.Role.CONSULTA,
        )
        event = AuditEvent.objects.get(entity_type="Perfil de acesso")
        self.assertEqual(event.actor_identifier, "manager@example.com")
        self.assertEqual(event.action, AuditEvent.Action.CREATE)
        self.assertEqual(event.object_id, str(user.pk))

    def test_manager_can_change_role_and_password_without_losing_legacy_id(self):
        fiscal, profile = make_user(
            AccessProfile.Role.FISCAL,
            "legacy@example.com",
            legacy_id="old-provider-user-17",
        )
        response = self.client.patch(
            f"/api/access-users/{fiscal.pk}",
            {
                "role": AccessProfile.Role.CONSULTA,
                "password": "Renewed!Password927",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        fiscal.refresh_from_db()
        self.assertEqual(profile.role, AccessProfile.Role.CONSULTA)
        self.assertEqual(profile.legacy_auth_id, "old-provider-user-17")
        self.assertTrue(fiscal.check_password("Renewed!Password927"))
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_identifier="manager@example.com",
                action=AuditEvent.Action.UPDATE,
            ).exists()
        )

    def test_last_active_manager_cannot_be_deactivated_or_demoted(self):
        response = self.client.patch(
            f"/api/access-users/{self.manager.pk}",
            {"activo": False},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertTrue(response.data["detail"])

        second_manager, _ = make_user(
            AccessProfile.Role.GESTOR,
            "second.manager@example.com",
        )
        response = self.client.patch(
            f"/api/access-users/{self.manager.pk}",
            {"role": AccessProfile.Role.FISCAL},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        second_manager.refresh_from_db()
        self.assertEqual(second_manager.access_profile.role, AccessProfile.Role.GESTOR)

    def test_non_manager_cannot_manage_accounts(self):
        fiscal, _ = make_user(AccessProfile.Role.FISCAL, "fiscal@example.com")
        client = APIClient()
        client.force_authenticate(user=fiscal)

        self.assertEqual(client.get("/api/access-users").status_code, 403)
        self.assertEqual(
            client.post(
                "/api/access-users",
                {
                    "name": "Someone",
                    "email": "someone@example.com",
                    "password": "New!Password927",
                    "role": AccessProfile.Role.CONSULTA,
                },
                format="json",
            ).status_code,
            403,
        )


@override_settings(SESSION_COOKIE_SECURE=False, CSRF_COOKIE_SECURE=False)
class NativeSessionAuthenticationTests(TestCase):
    def setUp(self):
        self.user, _ = make_user(
            AccessProfile.Role.GESTOR,
            "session@example.com",
            password="Initial!Password927",
        )

    def test_login_session_password_change_and_logout(self):
        client = Client(enforce_csrf_checks=True)
        csrf_response = client.get("/api/auth/csrf")
        token = csrf_response.json()["csrfToken"]

        login_response = client.post(
            "/api/auth/login",
            data=json.dumps(
                {"email": "session@example.com", "password": "Initial!Password927"}
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(login_response.status_code, 200, login_response.content)
        self.assertTrue(login_response.json()["authenticated"])
        self.assertEqual(
            client.get("/api/auth/session").json()["user"]["email"],
            "session@example.com",
        )

        token = client.get("/api/auth/csrf").json()["csrfToken"]
        change_response = client.post(
            "/api/auth/password",
            data=json.dumps(
                {
                    "current_password": "Initial!Password927",
                    "new_password": "Changed!Password927",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(change_response.status_code, 200, change_response.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Changed!Password927"))

        token = client.get("/api/auth/csrf").json()["csrfToken"]
        logout_response = client.post(
            "/api/auth/logout",
            data="{}",
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(logout_response.status_code, 200)
        self.assertFalse(client.get("/api/auth/session").json()["authenticated"])

    def test_login_without_csrf_token_is_rejected(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post(
            "/api/auth/login",
            data=json.dumps(
                {"email": "session@example.com", "password": "Initial!Password927"}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


class LegacyProfileMigrationTests(TransactionTestCase):
    migrate_from = ("works", "0002_accessprofile_auditevent")
    migrate_to = ("works", "0003_native_email_password_accounts")

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        LegacyProfile = old_apps.get_model("works", "AccessProfile")
        LegacyAuditEvent = old_apps.get_model("works", "AuditEvent")
        database = connection.alias

        LegacyProfile.objects.using(database).create(
            clerk_user_id="historic-provider-account-12",
            nome="Conta Histórica",
            email="historic@example.com",
            role="fiscal",
            activo=True,
        )
        LegacyAuditEvent.objects.using(database).create(
            entity_type="Obra",
            object_id="OBR-12",
            action="update",
            actor_identifier="historic-provider-account-12",
            actor_role="fiscal",
            details={"before": {"estado": "planeada"}, "after": {"estado": "em_execucao"}},
        )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])

    def tearDown(self):
        MigrationExecutor(connection).migrate([self.migrate_to])
        super().tearDown()

    def test_migration_links_legacy_profile_and_keeps_history(self):
        apps = MigrationExecutor(connection).loader.project_state([self.migrate_to]).apps
        Profile = apps.get_model("works", "AccessProfile")
        AuditEventModel = apps.get_model("works", "AuditEvent")
        User = apps.get_model("auth", "User")

        profile = Profile.objects.get(legacy_auth_id="historic-provider-account-12")
        user = User.objects.get(pk=profile.user_id)
        event = AuditEventModel.objects.get(object_id="OBR-12")

        self.assertEqual(user.email, "historic@example.com")
        self.assertTrue(user.password.startswith("!"))
        self.assertEqual(profile.role, "fiscal")
        self.assertEqual(event.actor_identifier, "historic-provider-account-12")
        self.assertEqual(event.details["before"]["estado"], "planeada")