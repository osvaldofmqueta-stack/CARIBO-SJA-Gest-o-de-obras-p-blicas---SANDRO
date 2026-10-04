from django.db.models import Avg, Count, Q, Sum
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit, snapshot
from .models import AccessProfile, Fiscalizacao, Obra, Ocorrencia
from .permissions import FieldRecordWritePermission, ManagerWritePermission
from .serializers import FiscalizacaoSerializer, ObraSerializer, OcorrenciaSerializer


class PublicAPIView(APIView):
    permission_classes = [AllowAny]


class HealthView(PublicAPIView):
    def get(self, request):
        return Response({"status": "ok"})


class AccessProfileView(APIView):
    def get(self, request):
        profile = request.user.access_profile
        return Response(
            {
                "role": profile.role,
                "role_label": profile.get_role_display(),
                "can_manage_works": profile.role == AccessProfile.Role.GESTOR,
                "can_write_field_records": profile.role
                in (AccessProfile.Role.GESTOR, AccessProfile.Role.FISCAL),
                "can_delete_field_records": profile.role == AccessProfile.Role.GESTOR,
                "can_publish_updates": profile.role
                in (AccessProfile.Role.GESTOR, AccessProfile.Role.FISCAL),
                "is_client": profile.role == AccessProfile.Role.CLIENTE,
            }
        )


class DashboardView(APIView):
    def get(self, request):
        if request.user.access_profile.role == AccessProfile.Role.CLIENTE:
            raise PermissionDenied(
                "Os indicadores operacionais não estão disponíveis para contas de cliente."
            )
        today = timezone.localdate()
        current_month = today.replace(day=1)
        obra_stats = Obra.objects.aggregate(
            total_obras=Count("id"),
            progresso_medio=Avg("progresso"),
            valor_contratual=Sum("valor_contrato"),
            valor_pago=Sum("valor_pago"),
        )
        total_obras = obra_stats["total_obras"] or 0
        payload = {
            "total_obras": total_obras,
            "obras_ativas": Obra.objects.filter(
                estado=Obra.Estado.EM_EXECUCAO
            ).count(),
            "obras_atrasadas": Obra.objects.filter(
                prazo_conclusao__lt=today,
                estado__in=[Obra.Estado.PLANEADA, Obra.Estado.EM_EXECUCAO],
            ).count(),
            "progresso_medio": round(float(obra_stats["progresso_medio"] or 0), 1),
            "valor_contratual": float(obra_stats["valor_contratual"] or 0),
            "valor_pago": float(obra_stats["valor_pago"] or 0),
            "ocorrencias_abertas": Ocorrencia.objects.exclude(
                estado=Ocorrencia.Estado.RESOLVIDA
            ).count(),
            "fiscalizacoes_mes": Fiscalizacao.objects.filter(
                data_visita__gte=current_month,
                data_visita__lte=today,
            ).count(),
            "obras": ObraSerializer(
                Obra.objects.order_by("prazo_conclusao")[:6],
                many=True,
            ).data,
            "fiscalizacoes_recentes": FiscalizacaoSerializer(
                Fiscalizacao.objects.select_related("obra")[:5],
                many=True,
            ).data,
            "ocorrencias_criticas": OcorrenciaSerializer(
                Ocorrencia.objects.select_related("obra")
                .filter(
                    gravidade__in=[
                        Ocorrencia.Gravidade.ALTA,
                        Ocorrencia.Gravidade.CRITICA,
                    ]
                )
                .exclude(estado=Ocorrencia.Estado.RESOLVIDA)[:5],
                many=True,
            ).data,
        }
        return Response(payload)


class AuditTrailMixin:
    audit_entity_type = ""

    def perform_create(self, serializer):
        instance = serializer.save()
        record_audit(
            self.request,
            entity_type=self.audit_entity_type,
            object_id=instance.pk,
            action="create",
            after=snapshot(self.get_serializer(instance)),
        )

    def perform_update(self, serializer):
        before = snapshot(self.get_serializer(serializer.instance))
        instance = serializer.save()
        record_audit(
            self.request,
            entity_type=self.audit_entity_type,
            object_id=instance.pk,
            action="update",
            before=before,
            after=snapshot(self.get_serializer(instance)),
        )

    def perform_destroy(self, instance):
        before = snapshot(self.get_serializer(instance))
        record_audit(
            self.request,
            entity_type=self.audit_entity_type,
            object_id=instance.pk,
            action="delete",
            before=before,
        )
        instance.delete()


class ObraListCreateView(AuditTrailMixin, generics.ListCreateAPIView):
    audit_entity_type = "Obra"
    permission_classes = [ManagerWritePermission]
    serializer_class = ObraSerializer
    queryset = Obra.objects.all()

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        status = self.request.query_params.get("status", "").strip()
        if search:
            queryset = queryset.filter(
                Q(referencia__icontains=search)
                | Q(nome__icontains=search)
                | Q(provincia__icontains=search)
                | Q(municipio__icontains=search)
                | Q(empreiteiro__icontains=search)
            )
        if status:
            queryset = queryset.filter(estado=status)
        return queryset


class ObraDetailView(AuditTrailMixin, generics.RetrieveUpdateDestroyAPIView):
    audit_entity_type = "Obra"
    permission_classes = [ManagerWritePermission]
    serializer_class = ObraSerializer
    queryset = Obra.objects.all()


class FiscalizacaoListCreateView(AuditTrailMixin, generics.ListCreateAPIView):
    audit_entity_type = "Fiscalizacao"
    permission_classes = [FieldRecordWritePermission]
    serializer_class = FiscalizacaoSerializer
    queryset = Fiscalizacao.objects.select_related("obra").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        profile = self.request.user.access_profile
        if profile.role == AccessProfile.Role.CLIENTE:
            queryset = queryset.filter(obra__clientes=profile)
        return queryset


class FiscalizacaoDetailView(AuditTrailMixin, generics.RetrieveUpdateDestroyAPIView):
    audit_entity_type = "Fiscalizacao"
    permission_classes = [FieldRecordWritePermission]
    serializer_class = FiscalizacaoSerializer
    queryset = Fiscalizacao.objects.select_related("obra").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        profile = self.request.user.access_profile
        if profile.role == AccessProfile.Role.CLIENTE:
            queryset = queryset.filter(obra__clientes=profile)
        return queryset


class OcorrenciaListCreateView(AuditTrailMixin, generics.ListCreateAPIView):
    audit_entity_type = "Ocorrencia"
    permission_classes = [FieldRecordWritePermission]
    serializer_class = OcorrenciaSerializer
    queryset = Ocorrencia.objects.select_related("obra").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        profile = self.request.user.access_profile
        if profile.role == AccessProfile.Role.CLIENTE:
            queryset = queryset.filter(obra__clientes=profile)
        return queryset


class OcorrenciaDetailView(AuditTrailMixin, generics.RetrieveUpdateDestroyAPIView):
    audit_entity_type = "Ocorrencia"
    permission_classes = [FieldRecordWritePermission]
    serializer_class = OcorrenciaSerializer
    queryset = Ocorrencia.objects.select_related("obra").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        profile = self.request.user.access_profile
        if profile.role == AccessProfile.Role.CLIENTE:
            queryset = queryset.filter(obra__clientes=profile)
        return queryset