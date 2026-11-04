from decimal import Decimal

from django.db import transaction
from django.http import FileResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit
from .models import (
    AccessProfile,
    ActualizacaoObra,
    AuditEvent,
    FotoActualizacaoObra,
    Obra,
)
from .permissions import ClientOnlyPermission, ProgressUpdatePermission
from .progress_storage import (
    ALLOWED_IMAGE_TYPES,
    MAX_PHOTO_BYTES,
    StorageUnavailable,
    active_storage_backend,
    create_object_upload,
    local_photos_are_shareable,
    open_local_photo,
    safe_original_name,
    save_local_photo,
    signed_photo_url,
    validate_image_file,
    verify_local_photo,
    verify_object_upload,
)
from .serializers import (
    ActualizacaoObraInputSerializer,
    ActualizacaoObraSerializer,
    ClientObraSerializer,
)


def _obra_queryset_for_user(request):
    queryset = Obra.objects.all()
    profile = request.user.access_profile
    if profile.role == AccessProfile.Role.CLIENTE:
        return queryset.filter(clientes=profile)
    return queryset


def _accessible_obra(request, obra_id):
    return get_object_or_404(_obra_queryset_for_user(request), pk=obra_id)


def _is_update_writer(request):
    profile = request.user.access_profile
    return profile.role in (AccessProfile.Role.GESTOR, AccessProfile.Role.FISCAL)


class ClientObrasView(APIView):
    permission_classes = [ClientOnlyPermission]

    def get(self, request):
        obras = (
            Obra.objects.filter(clientes=request.user.access_profile)
            .order_by("prazo_conclusao", "nome")
            .distinct()
        )
        return Response(ClientObraSerializer(obras, many=True).data)


class ClientObraDetailView(APIView):
    permission_classes = [ClientOnlyPermission]

    def get(self, request, obra_id):
        obra = get_object_or_404(
            Obra.objects.filter(clientes=request.user.access_profile),
            pk=obra_id,
        )
        return Response(ClientObraSerializer(obra).data)


class ObraActualizacoesView(APIView):
    permission_classes = [ProgressUpdatePermission]

    def get(self, request, obra_id):
        obra = _accessible_obra(request, obra_id)
        updates = (
            ActualizacaoObra.objects.filter(obra=obra)
            .select_related("autor", "obra")
            .prefetch_related("fotos")
        )
        return Response(
            ActualizacaoObraSerializer(
                updates,
                many=True,
                context={"request": request},
            ).data
        )

    def post(self, request, obra_id):
        obra = _accessible_obra(request, obra_id)
        if not _is_update_writer(request):
            return Response(
                {"detail": "Só gestores e fiscais podem publicar actualizações."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ActualizacaoObraInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        prepared_photos = []
        for photo in values["fotos"]:
            expected_prefix = (
                f"/objects/obra-actualizacoes/{obra.pk}/"
                if photo["storage_backend"] == FotoActualizacaoObra.StorageBackend.OBJECT
                else f"obra-actualizacoes/{obra.pk}/"
            )
            if not photo["object_path"].startswith(expected_prefix):
                return Response(
                    {"detail": "Uma fotografia não pertence a esta obra."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if photo["storage_backend"] == FotoActualizacaoObra.StorageBackend.OBJECT:
                actual_size, actual_type = verify_object_upload(
                    photo["object_path"],
                    photo["content_type"],
                )
            else:
                if not local_photos_are_shareable():
                    return Response(
                        {
                            "detail": (
                                "Esta instalação usa uma base de dados partilhada; "
                                "fotografias guardadas apenas neste PC não podem ser "
                                "publicadas. Configure o App Storage."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                actual_size, actual_type = verify_local_photo(
                    photo["object_path"],
                    photo["content_type"],
                )
            prepared_photos.append(
                {
                    **photo,
                    "nome_original": safe_original_name(
                        photo["nome_original"],
                        actual_type,
                    ),
                    "content_type": actual_type,
                    "tamanho": actual_size,
                }
            )

        old_progress = Decimal(obra.progresso)
        new_progress = values["progresso"]
        with transaction.atomic():
            update = ActualizacaoObra.objects.create(
                obra=obra,
                titulo=values["titulo"].strip(),
                descricao=values["descricao"].strip(),
                progresso=new_progress,
                autor=request.user,
            )
            FotoActualizacaoObra.objects.bulk_create(
                [
                    FotoActualizacaoObra(
                        actualizacao=update,
                        object_path=photo["object_path"],
                        storage_backend=photo["storage_backend"],
                        nome_original=photo["nome_original"],
                        content_type=photo["content_type"],
                        tamanho=photo["tamanho"],
                    )
                    for photo in prepared_photos
                ]
            )

            obra.progresso = new_progress
            update_fields = ["progresso", "actualizado_em"]
            if new_progress >= 100:
                obra.estado = Obra.Estado.CONCLUIDA
                update_fields.append("estado")
            elif obra.estado == Obra.Estado.CONCLUIDA:
                obra.estado = Obra.Estado.EM_EXECUCAO
                update_fields.append("estado")
            obra.save(update_fields=update_fields)

            record_audit(
                request,
                entity_type="ActualizacaoObra",
                object_id=update.pk,
                action=AuditEvent.Action.CREATE,
                after={
                    "obra_id": obra.pk,
                    "titulo": update.titulo,
                    "progresso": float(update.progresso),
                    "foto_count": len(prepared_photos),
                },
            )
            if old_progress != Decimal(new_progress):
                record_audit(
                    request,
                    entity_type="Obra",
                    object_id=obra.pk,
                    action=AuditEvent.Action.UPDATE,
                    before={"progresso": float(old_progress)},
                    after={"progresso": float(new_progress), "estado": obra.estado},
                )

        return Response(
            ActualizacaoObraSerializer(
                update,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class ObraFotoUploadUrlView(APIView):
    permission_classes = [ProgressUpdatePermission]

    def post(self, request, obra_id):
        _accessible_obra(request, obra_id)
        if not _is_update_writer(request):
            return Response(
                {"detail": "Só gestores e fiscais podem enviar fotografias."},
                status=status.HTTP_403_FORBIDDEN,
            )
        content_type = request.data.get("content_type")
        if content_type not in ALLOWED_IMAGE_TYPES:
            return Response(
                {"detail": "Use uma imagem JPEG, PNG ou WebP."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            size = int(request.data.get("tamanho", 0))
        except (TypeError, ValueError):
            size = 0
        if size <= 0 or size > MAX_PHOTO_BYTES:
            return Response(
                {"detail": "Cada fotografia deve ter no máximo 10 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        backend = active_storage_backend()
        if backend == "object":
            upload = create_object_upload(obra_id, content_type)
            return Response(upload)
        if backend == "local":
            return Response(
                {"backend": "local", "upload_url": None, "object_path": None}
            )
        raise StorageUnavailable()


class ObraFotoLocalUploadView(APIView):
    permission_classes = [ProgressUpdatePermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, obra_id):
        _accessible_obra(request, obra_id)
        if not _is_update_writer(request):
            return Response(
                {"detail": "Só gestores e fiscais podem enviar fotografias."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if active_storage_backend() != "local":
            raise StorageUnavailable()

        uploaded_file = request.FILES.get("foto")
        if uploaded_file is None:
            return Response(
                {"detail": "Seleccione uma fotografia."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content_type = validate_image_file(uploaded_file)
        object_path = save_local_photo(obra_id, uploaded_file, content_type)
        return Response(
            {
                "backend": "local",
                "object_path": object_path,
                "nome_original": safe_original_name(
                    uploaded_file.name,
                    content_type,
                ),
                "content_type": content_type,
                "tamanho": uploaded_file.size,
            },
            status=status.HTTP_201_CREATED,
        )


class ObraFotoView(APIView):
    permission_classes = [ProgressUpdatePermission]

    def get(self, request, obra_id, actualizacao_id, foto_id):
        obra = _accessible_obra(request, obra_id)
        foto = get_object_or_404(
            FotoActualizacaoObra.objects.select_related("actualizacao"),
            pk=foto_id,
            actualizacao_id=actualizacao_id,
            actualizacao__obra=obra,
        )
        if foto.storage_backend == FotoActualizacaoObra.StorageBackend.OBJECT:
            response = HttpResponseRedirect(signed_photo_url(foto.object_path))
            response["Cache-Control"] = "private, no-store"
            return response

        if not local_photos_are_shareable():
            raise StorageUnavailable(
                "Esta fotografia está guardada apenas neste PC e não pode ser "
                "aberta através da base de dados partilhada."
            )
        response = FileResponse(
            open_local_photo(foto.object_path),
            content_type=foto.content_type,
        )
        response["Cache-Control"] = "private, no-store"
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        return response