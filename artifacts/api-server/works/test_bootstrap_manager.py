import os
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import AccessProfile


class BootstrapManagerCommandTests(TestCase):
    def test_environment_mode_creates_active_gestor_without_printing_password(self):
        password = "Bootstrap-Test!Password-9284"
        output = StringIO()
        with patch.dict(
            os.environ,
            {
                "BOOTSTRAP_TEST_PASSWORD": password,
                "BOOTSTRAP_TEST_CONFIRMATION": password,
            },
        ):
            call_command(
                "bootstrap_manager",
                email="osvaldo.f.m.queta@gmail.com",
                name="Osvaldo Queta",
                password_env="BOOTSTRAP_TEST_PASSWORD",
                confirmation_env="BOOTSTRAP_TEST_CONFIRMATION",
                stdout=output,
            )

        user = get_user_model().objects.get(email="osvaldo.f.m.queta@gmail.com")
        self.assertTrue(user.check_password(password))
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.first_name, "Osvaldo Queta")
        self.assertEqual(user.access_profile.role, AccessProfile.Role.GESTOR)
        self.assertTrue(user.access_profile.activo)
        self.assertEqual(user.access_profile.nome, "Osvaldo Queta")
        self.assertNotIn(password, output.getvalue())

    def test_environment_mode_rejects_mismatched_passwords_without_writing(self):
        with patch.dict(
            os.environ,
            {
                "BOOTSTRAP_TEST_PASSWORD": "Bootstrap-Test!Password-9284",
                "BOOTSTRAP_TEST_CONFIRMATION": "Different-Test!Password-9284",
            },
        ):
            with self.assertRaisesMessage(
                CommandError, "As palavras-passe não coincidem."
            ):
                call_command(
                    "bootstrap_manager",
                    email="osvaldo.f.m.queta@gmail.com",
                    name="Osvaldo Queta",
                    password_env="BOOTSTRAP_TEST_PASSWORD",
                    confirmation_env="BOOTSTRAP_TEST_CONFIRMATION",
                    stdout=StringIO(),
                    stderr=StringIO(),
                )

        self.assertFalse(
            get_user_model().objects.filter(
                email__iexact="osvaldo.f.m.queta@gmail.com"
            ).exists()
        )