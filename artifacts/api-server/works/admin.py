import json

from django.contrib import admin
from django.core.serializers.json import DjangoJSONEncoder
from django.forms.models import model_to_dict

from .models import AccessProfile, AuditEvent, Fiscalizacao, Obra, Ocorrencia


def _snapshot(instance):
    return json.loads(
        json.dumps(model_to_dict(instance), cls=DjangoJSONEncoder, ensure_ascii=False)
    )


class AuditedModelAdmin(admin.ModelAdmin):
    def _record(self, request, instance, action, before=None, after=None):
        AuditEvent.objects.create(
            entity_type=instance._meta.verbose_name.title(),
            object_id=str(instance.pk),
            action=action,
            actor_identifier=f"django-admin:{request.user.get_username()}",
            actor_role="administração",
            details={"before": before, "after": after},
        )

    def save_model(self, request, obj, form, change):
        before = _snapshot(obj) if change else None
        super().save_model(request, obj, form, change)
        self._record(
            request,
            obj,
            AuditEvent.Action.UPDATE if change else AuditEvent.Action.CREATE,
            before=before,
            after=_snapshot(obj),
        )

    def delete_model(self, request, obj):
        before = _snapshot(obj)
        self._record(request, obj, AuditEvent.Action.DELETE, before=before)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)


@admin.register(AccessProfile)
class AccessProfileAdmin(AuditedModelAdmin):
    list_display = ("nome", "email", "user", "role", "activo", "actualizado_em")
    list_filter = ("role", "activo")
    search_fields = ("nome", "email", "legacy_auth_id", "user__username")
    readonly_fields = ("criado_em", "actualizado_em")
    fieldsets = (
        (
            "Conta individual",
            {
                "fields": ("user", "nome", "email", "legacy_auth_id"),
            },
        ),
        ("Permissões", {"fields": ("role", "activo")}),
        ("Obras atribuídas ao cliente", {"fields": ("obras",)}),
        ("Registo", {"fields": ("criado_em", "actualizado_em")}),
    )


@admin.register(Obra)
class ObraAdmin(AuditedModelAdmin):
    list_display = (
        "referencia",
        "nome",
        "provincia",
        "estado",
        "progresso",
        "prazo_conclusao",
    )
    list_filter = ("estado", "provincia")
    search_fields = ("referencia", "nome", "empreiteiro")


@admin.register(Fiscalizacao)
class FiscalizacaoAdmin(AuditedModelAdmin):
    list_display = ("obra", "inspector", "data_visita", "qualidade", "progresso")
    list_filter = ("qualidade", "data_visita")
    search_fields = ("obra__referencia", "obra__nome", "inspector")


@admin.register(Ocorrencia)
class OcorrenciaAdmin(AuditedModelAdmin):
    list_display = ("titulo", "obra", "gravidade", "estado", "prazo_resolucao")
    list_filter = ("gravidade", "estado")
    search_fields = ("titulo", "obra__referencia", "obra__nome")


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "entity_type",
        "object_id",
        "action",
        "actor_identifier",
        "actor_role",
    )
    list_filter = ("action", "entity_type", "actor_role")
    search_fields = ("entity_type", "object_id", "actor_identifier")
    readonly_fields = (
        "entity_type",
        "object_id",
        "action",
        "actor_identifier",
        "actor_role",
        "details",
        "created_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False