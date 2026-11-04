from datetime import date, timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import (
    AccessProfile,
    ActualizacaoObra,
    AuditEvent,
    FotoActualizacaoObra,
    Obra,
)


def make_work(reference):
    return Obra.objects.create(
        referencia=reference,
        nome=f"Projecto {reference}",
        descricao="Descrição interna",
        provincia="Luanda",
        municipio="Kilamba Kiaxi",
        empreiteiro="Empreiteiro de teste",
        valor_contrato=1_000_000,
        valor_pago=250_000,
        progresso=20,
        estado=Obra.Estado.EM_EXECUCAO,
        data_inicio=date.today() - timedelta(days=30),
        prazo_conclusao=date.today() + timedelta(days=90),
    )


def make_access_user(role, email):
    user = get_user_model().objects.create_user(
        username=email.replace("@", "-"),
        email=email,
        password="Test-Password-Strong-2026",
    )
    profile = AccessProfile.objects.create(
        user=user,
        nome=email.split("@")[0],
        email=email,
        role=role,
    )
    return user, profile


class ClientProgressAccessTests(TestCase):
    def setUp(self):
        self.assigned_work = make_work("CLIENT-001")
        self.private_work = make_work("CLIENT-002")
        self.client_user, self.client_profile = make_access_user(
            AccessProfile.Role.CLIENTE,
            "client@example.com",
        )
        self.client_profile.obras.add(self.assigned_work)
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.client_user)

    def test_client_only_receives_assigned_safe_work_fields(self):
        response = self.client_api.get("/api/client/obras")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.assigned_work.pk])
        self.assertNotIn("valor_contrato", response.data[0])
        self.assertNotIn("valor_pago", response.data[0])
        self.assertNotIn("empreiteiro", response.data[0])
        self.assertEqual(
            self.client_api.get(
                f"/api/client/obras/{self.private_work.pk}"
            ).status_code,
            404,
        )

    def test_client_cannot_read_staff_dashboards_or_field_records(self):
        self.assertEqual(self.client_api.get("/api/dashboard").status_code, 403)
        self.assertEqual(self.client_api.get("/api/obras").status_code, 403)
        self.assertEqual(self.client_api.get("/api/fiscalizacoes").status_code, 403)
        self.assertEqual(self.client_api.get("/api/ocorrencias").status_code, 403)

    def test_client_can_read_assigned_progress_but_cannot_publish_or_read_other_work(self):
        response = self.client_api.get(
            f"/api/obras/{self.assigned_work.pk}/actualizacoes"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        self.assertEqual(
            self.client_api.get(
                f"/api/obras/{self.private_work.pk}/actualizacoes"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client_api.post(
                f"/api/obras/{self.assigned_work.pk}/actualizacoes",
                {"titulo": "Actualização", "progresso": 30},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client_api.post(
                f"/api/obras/{self.assigned_work.pk}/actualizacoes/upload-url",
                {"content_type": "image/jpeg", "tamanho": 16},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client_api.post(
                f"/api/obras/{self.assigned_work.pk}/actualizacoes/upload-local",
                {},
                format="multipart",
            ).status_code,
            403,
        )

    def test_photo_route_checks_work_assignment_before_opening_photo(self):
        update = ActualizacaoObra.objects.create(
            obra=self.private_work,
            titulo="Privado",
            progresso=45,
        )
        photo = FotoActualizacaoObra.objects.create(
            actualizacao=update,
            object_path=(
                f"obra-actualizacoes/{self.private_work.pk}/photo.jpg"
            ),
            storage_backend=FotoActualizacaoObra.StorageBackend.LOCAL,
            nome_original="photo.jpg",
            content_type="image/jpeg",
            tamanho=4,
        )

        response = self.client_api.get(
            f"/api/obras/{self.private_work.pk}/actualizacoes/"
            f"{update.pk}/fotos/{photo.pk}"
        )
        self.assertEqual(response.status_code, 404)


class ProgressPublishingTests(TestCase):
    def setUp(self):
        self.work = make_work("PROGRESS-001")
        self.fiscal, self.profile = make_access_user(
            AccessProfile.Role.FISCAL,
            "fiscal@example.com",
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.fiscal)

    def test_staff_update_changes_work_progress_and_is_audited(self):
        response = self.api.post(
            f"/api/obras/{self.work.pk}/actualizacoes",
            {
                "titulo": "Fundações concluídas",
                "descricao": "A equipa terminou esta etapa.",
                "progresso": 42.5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["progresso"], 42.5)
        self.work.refresh_from_db()
        self.assertEqual(float(self.work.progresso), 42.5)
        self.assertTrue(
            AuditEvent.objects.filter(
                entity_type="ActualizacaoObra",
                object_id=str(response.data["id"]),
                actor_identifier="fiscal@example.com",
            ).exists()
        )
        consulta, _ = make_access_user(
            AccessProfile.Role.CONSULTA,
            "consulta@example.com",
        )
        consulta_api = APIClient()
        consulta_api.force_authenticate(user=consulta)
        self.assertEqual(
            consulta_api.post(
                f"/api/obras/{self.work.pk}/actualizacoes",
                {"titulo": "Não autorizado", "progresso": 43},
                format="json",
            ).status_code,
            403,
        )

    def test_manager_must_assign_at_least_one_work_to_a_client_account(self):
        manager, _ = make_access_user(
            AccessProfile.Role.GESTOR,
            "manager@example.com",
        )
        manager_api = APIClient()
        manager_api.force_authenticate(user=manager)

        missing_assignment = manager_api.post(
            "/api/access-users",
            {
                "name": "Cliente",
                "email": "new.client@example.com",
                "password": "Angola!Secure927",
                "role": AccessProfile.Role.CLIENTE,
            },
            format="json",
        )
        self.assertEqual(missing_assignment.status_code, 400)

        created = manager_api.post(
            "/api/access-users",
            {
                "name": "Cliente",
                "email": "new.client@example.com",
                "password": "Angola!Secure927",
                "role": AccessProfile.Role.CLIENTE,
                "obra_ids": [self.work.pk],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["obra_ids"], [self.work.pk])

    def test_local_photo_upload_and_private_retrieval(self):
        with TemporaryDirectory() as media_root:
            with override_settings(
                MEDIA_ROOT=media_root,
                CARIBO_SHARED_DATABASE=False,
            ):
                with patch(
                    "works.progress_views.active_storage_backend",
                    return_value="local",
                ):
                    upload = self.api.post(
                        f"/api/obras/{self.work.pk}/actualizacoes/upload-local",
                        {
                            "foto": SimpleUploadedFile(
                                "fundações.jpg",
                                b"\xff\xd8\xff" + b"\x00" * 24,
                                content_type="image/jpeg",
                            )
                        },
                        format="multipart",
                    )

                self.assertEqual(upload.status_code, 201, upload.data)
                self.assertEqual(upload.data["backend"], "local")

                published = self.api.post(
                    f"/api/obras/{self.work.pk}/actualizacoes",
                    {
                        "titulo": "Registo fotográfico",
                        "progresso": 30,
                        "fotos": [
                            {
                                "object_path": upload.data["object_path"],
                                "storage_backend": "local",
                                "nome_original": upload.data["nome_original"],
                                "content_type": upload.data["content_type"],
                                "tamanho": upload.data["tamanho"],
                            }
                        ],
                    },
                    format="json",
                )
                self.assertEqual(published.status_code, 201, published.data)
                photo = published.data["fotos"][0]
                from urllib.parse import urlparse

                photo_response = self.api.get(urlparse(photo["foto_url"]).path)
                self.assertEqual(photo_response.status_code, 200)
                self.assertEqual(
                    b"".join(photo_response.streaming_content)[:3],
                    b"\xff\xd8\xff",
                )

                assigned_client, client_profile = make_access_user(
                    AccessProfile.Role.CLIENTE,
                    "assigned@example.com",
                )
                client_profile.obras.add(self.work)
                assigned_client_api = APIClient()
                assigned_client_api.force_authenticate(user=assigned_client)
                client_photo = assigned_client_api.get(
                    urlparse(photo["foto_url"]).path
                )
                self.assertEqual(client_photo.status_code, 200)
                b"".join(client_photo.streaming_content)

                other_client, _ = make_access_user(
                    AccessProfile.Role.CLIENTE,
                    "other@example.com",
                )
                other_client_api = APIClient()
                other_client_api.force_authenticate(user=other_client)
                self.assertEqual(
                    other_client_api.get(
                        urlparse(photo["foto_url"]).path
                    ).status_code,
                    404,
                )

    def test_shared_database_requires_shared_photo_storage(self):
        update = ActualizacaoObra.objects.create(
            obra=self.work,
            titulo="Registo fotográfico",
            progresso=30,
            autor=self.fiscal,
        )
        photo = FotoActualizacaoObra.objects.create(
            actualizacao=update,
            object_path=f"obra-actualizacoes/{self.work.pk}/photo.jpg",
            storage_backend=FotoActualizacaoObra.StorageBackend.LOCAL,
            nome_original="photo.jpg",
            content_type="image/jpeg",
            tamanho=4,
        )

        with (
            override_settings(CARIBO_SHARED_DATABASE=True),
            patch.dict(
                "os.environ",
                {"CARIBO_LOCAL": "1", "PRIVATE_OBJECT_DIR": ""},
            ),
        ):
            upload_target = self.api.post(
                f"/api/obras/{self.work.pk}/actualizacoes/upload-url",
                {"content_type": "image/jpeg", "tamanho": 16},
                format="json",
            )
            self.assertEqual(upload_target.status_code, 503)
            self.assertIn("armazenamento partilhado", upload_target.data["detail"])

            local_upload = self.api.post(
                f"/api/obras/{self.work.pk}/actualizacoes/upload-local",
                {
                    "foto": SimpleUploadedFile(
                        "photo.jpg",
                        b"\xff\xd8\xff" + b"\x00" * 24,
                        content_type="image/jpeg",
                    )
                },
                format="multipart",
            )
            self.assertEqual(local_upload.status_code, 503)

            publish = self.api.post(
                f"/api/obras/{self.work.pk}/actualizacoes",
                {
                    "titulo": "Publicação local",
                    "progresso": 35,
                    "fotos": [
                        {
                            "object_path": photo.object_path,
                            "storage_backend": "local",
                            "nome_original": photo.nome_original,
                            "content_type": photo.content_type,
                            "tamanho": photo.tamanho,
                        }
                    ],
                },
                format="json",
            )
            self.assertEqual(publish.status_code, 400)
            self.assertIn("não podem ser publicadas", publish.data["detail"])

            photo_response = self.api.get(
                f"/api/obras/{self.work.pk}/actualizacoes/{update.pk}/fotos/{photo.pk}"
            )
            self.assertEqual(photo_response.status_code, 503)
            self.assertIn("apenas neste PC", photo_response.data["detail"])