from django.conf import settings
from django.db import models


class AccessProfile(models.Model):
    class Role(models.TextChoices):
        GESTOR = "gestor", "Gestor"
        FISCAL = "fiscal", "Fiscal"
        CONSULTA = "consulta", "Consulta"
        CLIENTE = "cliente", "Cliente"

    legacy_auth_id = models.CharField(max_length=255, blank=True, default="")
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name="access_profile",
    )
    nome = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=16, choices=Role.choices)
    obras = models.ManyToManyField(
        "Obra",
        blank=True,
        related_name="clientes",
    )
    activo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    actualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome", "legacy_auth_id"]
        verbose_name = "Perfil de acesso"
        verbose_name_plural = "Perfis de acesso"

    def __str__(self) -> str:
        return f"{self.nome or self.email or self.legacy_auth_id} — {self.get_role_display()}"


class AuditEvent(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "Criação"
        UPDATE = "update", "Alteração"
        DELETE = "delete", "Eliminação"

    entity_type = models.CharField(max_length=40)
    object_id = models.CharField(max_length=64)
    action = models.CharField(max_length=12, choices=Action.choices)
    actor_identifier = models.CharField(max_length=255)
    actor_role = models.CharField(max_length=32, blank=True)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Registo de auditoria"
        verbose_name_plural = "Registos de auditoria"

    def __str__(self) -> str:
        return f"{self.get_action_display()} — {self.entity_type} #{self.object_id}"


class Obra(models.Model):
    class Estado(models.TextChoices):
        PLANEADA = "planeada", "Planeada"
        EM_EXECUCAO = "em_execucao", "Em execução"
        SUSPENSA = "suspensa", "Suspensa"
        CONCLUIDA = "concluida", "Concluída"

    referencia = models.CharField(max_length=32, unique=True)
    nome = models.CharField(max_length=240)
    descricao = models.TextField(blank=True)
    provincia = models.CharField(max_length=100)
    municipio = models.CharField(max_length=100)
    empreiteiro = models.CharField(max_length=200)
    valor_contrato = models.DecimalField(max_digits=18, decimal_places=2)
    valor_pago = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    progresso = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    estado = models.CharField(
        max_length=24,
        choices=Estado.choices,
        default=Estado.PLANEADA,
    )
    data_inicio = models.DateField()
    prazo_conclusao = models.DateField()
    criado_em = models.DateTimeField(auto_now_add=True)
    actualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["prazo_conclusao", "nome"]
        verbose_name = "Obra"
        verbose_name_plural = "Obras"

    def __str__(self) -> str:
        return f"{self.referencia} — {self.nome}"


class ActualizacaoObra(models.Model):
    obra = models.ForeignKey(
        Obra,
        on_delete=models.CASCADE,
        related_name="actualizacoes",
    )
    titulo = models.CharField(max_length=180)
    descricao = models.TextField(blank=True)
    progresso = models.DecimalField(max_digits=5, decimal_places=2)
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="actualizacoes_obras",
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em", "-pk"]
        verbose_name = "Actualização da obra"
        verbose_name_plural = "Actualizações da obra"

    def __str__(self) -> str:
        return f"{self.obra.referencia} — {self.titulo}"


class FotoActualizacaoObra(models.Model):
    class StorageBackend(models.TextChoices):
        OBJECT = "object", "App Storage"
        LOCAL = "local", "Armazenamento local"

    actualizacao = models.ForeignKey(
        ActualizacaoObra,
        on_delete=models.CASCADE,
        related_name="fotos",
    )
    object_path = models.CharField(max_length=512, unique=True)
    storage_backend = models.CharField(
        max_length=12,
        choices=StorageBackend.choices,
    )
    nome_original = models.CharField(max_length=255)
    content_type = models.CharField(max_length=40)
    tamanho = models.PositiveBigIntegerField()
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["pk"]
        verbose_name = "Fotografia da actualização"
        verbose_name_plural = "Fotografias da actualização"

    def __str__(self) -> str:
        return self.nome_original


class Fiscalizacao(models.Model):
    class Qualidade(models.TextChoices):
        CONFORME = "conforme", "Conforme"
        ATENCAO = "atencao", "Atenção"
        NAO_CONFORME = "nao_conforme", "Não conforme"

    obra = models.ForeignKey(
        Obra,
        on_delete=models.CASCADE,
        related_name="fiscalizacoes",
    )
    inspector = models.CharField(max_length=160)
    data_visita = models.DateField()
    progresso = models.DecimalField(max_digits=5, decimal_places=2)
    qualidade = models.CharField(
        max_length=20,
        choices=Qualidade.choices,
        default=Qualidade.CONFORME,
    )
    observacoes = models.TextField(blank=True)
    proxima_visita = models.DateField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-data_visita", "-criado_em"]
        verbose_name = "Fiscalização"
        verbose_name_plural = "Fiscalizações"

    def __str__(self) -> str:
        return f"Fiscalização de {self.obra} em {self.data_visita}"


class Ocorrencia(models.Model):
    class Gravidade(models.TextChoices):
        BAIXA = "baixa", "Baixa"
        MEDIA = "media", "Média"
        ALTA = "alta", "Alta"
        CRITICA = "critica", "Crítica"

    class Estado(models.TextChoices):
        ABERTA = "aberta", "Aberta"
        EM_RESOLUCAO = "em_resolucao", "Em resolução"
        RESOLVIDA = "resolvida", "Resolvida"

    obra = models.ForeignKey(
        Obra,
        on_delete=models.CASCADE,
        related_name="ocorrencias",
    )
    titulo = models.CharField(max_length=220)
    descricao = models.TextField()
    gravidade = models.CharField(
        max_length=16,
        choices=Gravidade.choices,
        default=Gravidade.MEDIA,
    )
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.ABERTA,
    )
    data_registo = models.DateField()
    prazo_resolucao = models.DateField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-data_registo", "-criado_em"]
        verbose_name = "Ocorrência"
        verbose_name_plural = "Ocorrências"

    def __str__(self) -> str:
        return f"{self.titulo} — {self.obra.referencia}"