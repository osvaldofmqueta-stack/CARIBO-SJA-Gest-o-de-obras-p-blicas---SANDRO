from rest_framework import serializers
from django.urls import reverse

from .audit import record_audit
from .models import (
    ActualizacaoObra,
    AuditEvent,
    Fiscalizacao,
    FotoActualizacaoObra,
    Obra,
    Ocorrencia,
)
from .progress_storage import ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES


class ObraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Obra
        fields = [
            "id",
            "referencia",
            "nome",
            "descricao",
            "provincia",
            "municipio",
            "empreiteiro",
            "valor_contrato",
            "valor_pago",
            "progresso",
            "estado",
            "data_inicio",
            "prazo_conclusao",
            "criado_em",
        ]
        read_only_fields = ["id", "criado_em"]

    def validate(self, data):
        contrato = data.get("valor_contrato", getattr(self.instance, "valor_contrato", None))
        pago = data.get("valor_pago", getattr(self.instance, "valor_pago", 0))
        if contrato is not None and pago is not None and pago > contrato:
            raise serializers.ValidationError(
                {"valor_pago": "O valor pago não pode ultrapassar o valor do contrato."}
            )
        return data


class ClientObraSerializer(serializers.ModelSerializer):
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = Obra
        fields = [
            "id",
            "referencia",
            "nome",
            "descricao",
            "provincia",
            "municipio",
            "progresso",
            "estado",
            "estado_label",
            "data_inicio",
            "prazo_conclusao",
            "actualizado_em",
        ]
        read_only_fields = fields


class FotoActualizacaoSerializer(serializers.ModelSerializer):
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = FotoActualizacaoObra
        fields = ["id", "nome_original", "content_type", "tamanho", "foto_url"]
        read_only_fields = fields

    def get_foto_url(self, foto):
        request = self.context.get("request")
        path = reverse(
            "obra-progress-photo",
            kwargs={
                "obra_id": foto.actualizacao.obra_id,
                "actualizacao_id": foto.actualizacao_id,
                "foto_id": foto.pk,
            },
        )
        return path


class ActualizacaoObraSerializer(serializers.ModelSerializer):
    autor = serializers.SerializerMethodField()
    fotos = FotoActualizacaoSerializer(many=True, read_only=True)

    class Meta:
        model = ActualizacaoObra
        fields = ["id", "titulo", "descricao", "progresso", "autor", "criado_em", "fotos"]
        read_only_fields = fields

    def get_autor(self, actualizacao):
        user = actualizacao.autor
        if user is None:
            return "Utilizador removido"
        profile = getattr(user, "access_profile", None)
        return (
            (profile.nome if profile else "")
            or user.get_full_name()
            or user.email
            or user.get_username()
        )


class FotoActualizacaoInputSerializer(serializers.Serializer):
    object_path = serializers.CharField(max_length=512)
    storage_backend = serializers.ChoiceField(
        choices=FotoActualizacaoObra.StorageBackend.choices
    )
    nome_original = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=tuple(ALLOWED_IMAGE_TYPES))
    tamanho = serializers.IntegerField(min_value=1, max_value=MAX_PHOTO_BYTES)


class ActualizacaoObraInputSerializer(serializers.Serializer):
    titulo = serializers.CharField(max_length=180, allow_blank=False)
    descricao = serializers.CharField(required=False, allow_blank=True, default="")
    progresso = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100,
    )
    fotos = serializers.ListField(
        child=FotoActualizacaoInputSerializer(),
        required=False,
        default=list,
        max_length=6,
    )


class FiscalizacaoSerializer(serializers.ModelSerializer):
    obra_nome = serializers.CharField(source="obra.nome", read_only=True)
    obra_id = serializers.PrimaryKeyRelatedField(
        source="obra",
        queryset=Obra.objects.all(),
    )

    class Meta:
        model = Fiscalizacao
        fields = [
            "id",
            "obra_id",
            "obra_nome",
            "inspector",
            "data_visita",
            "progresso",
            "qualidade",
            "observacoes",
            "proxima_visita",
            "criado_em",
        ]
        read_only_fields = ["id", "criado_em"]

    def create(self, validated_data):
        fiscalizacao = super().create(validated_data)
        self._sync_work_progress(fiscalizacao)
        return fiscalizacao

    def update(self, instance, validated_data):
        fiscalizacao = super().update(instance, validated_data)
        self._sync_work_progress(fiscalizacao)
        return fiscalizacao

    def _sync_work_progress(self, fiscalizacao):
        obra = fiscalizacao.obra
        before = {"progresso": float(obra.progresso), "estado": obra.estado}
        obra.progresso = fiscalizacao.progresso
        if fiscalizacao.progresso >= 100:
            obra.estado = Obra.Estado.CONCLUIDA
        elif obra.estado == Obra.Estado.CONCLUIDA:
            obra.estado = Obra.Estado.EM_EXECUCAO
        obra.save(update_fields=["progresso", "estado", "actualizado_em"])
        after = {"progresso": float(obra.progresso), "estado": obra.estado}
        if before != after:
            request = self.context.get("request")
            if request:
                record_audit(
                    request,
                    entity_type="Obra",
                    object_id=obra.pk,
                    action=AuditEvent.Action.UPDATE,
                    before=before,
                    after=after,
                )


class OcorrenciaSerializer(serializers.ModelSerializer):
    obra_nome = serializers.CharField(source="obra.nome", read_only=True)
    obra_id = serializers.PrimaryKeyRelatedField(
        source="obra",
        queryset=Obra.objects.all(),
    )

    class Meta:
        model = Ocorrencia
        fields = [
            "id",
            "obra_id",
            "obra_nome",
            "titulo",
            "descricao",
            "gravidade",
            "estado",
            "data_registo",
            "prazo_resolucao",
            "criado_em",
        ]
        read_only_fields = ["id", "criado_em"]