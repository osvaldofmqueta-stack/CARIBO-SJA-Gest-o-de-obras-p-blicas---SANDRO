from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from works.models import Fiscalizacao, Obra, Ocorrencia


class Command(BaseCommand):
    help = "Cria um pequeno conjunto de dados demonstrativos para o painel."

    def handle(self, *args, **options):
        if Obra.objects.exists():
            self.stdout.write(
                "Já existem obras; os dados existentes foram preservados."
            )
            return

        today = timezone.localdate()
        obras_data = [
            {
                "referencia": "CSJA-2026-001",
                "nome": "Reabilitação da Escola Primária 14 de Abril",
                "descricao": "Reabilitação de salas de aula, cobertura e instalações sanitárias.",
                "provincia": "Luanda",
                "municipio": "Cacuaco",
                "empreiteiro": "Horizonte Construções, Lda.",
                "valor_contrato": "182500000.00",
                "valor_pago": "126000000.00",
                "progresso": "72.00",
                "estado": Obra.Estado.EM_EXECUCAO,
                "data_inicio": today - timedelta(days=125),
                "prazo_conclusao": today + timedelta(days=38),
            },
            {
                "referencia": "CSJA-2026-002",
                "nome": "Drenagem e pavimentação do eixo do mercado municipal",
                "descricao": "Execução da drenagem pluvial e pavimentação de vias de acesso.",
                "provincia": "Benguela",
                "municipio": "Lobito",
                "empreiteiro": "Kwanza Infra-Estruturas, Lda.",
                "valor_contrato": "345000000.00",
                "valor_pago": "168500000.00",
                "progresso": "48.00",
                "estado": Obra.Estado.EM_EXECUCAO,
                "data_inicio": today - timedelta(days=205),
                "prazo_conclusao": today - timedelta(days=12),
            },
            {
                "referencia": "CSJA-2026-003",
                "nome": "Construção do Centro de Saúde do Calima",
                "descricao": "Construção e apetrechamento básico de unidade de saúde municipal.",
                "provincia": "Huambo",
                "municipio": "Huambo",
                "empreiteiro": "Nova Base Engenharia, Lda.",
                "valor_contrato": "129800000.00",
                "valor_pago": "123000000.00",
                "progresso": "94.00",
                "estado": Obra.Estado.EM_EXECUCAO,
                "data_inicio": today - timedelta(days=186),
                "prazo_conclusao": today + timedelta(days=21),
            },
        ]
        obras = {}
        for values in obras_data:
            obra, _ = Obra.objects.update_or_create(
                referencia=values["referencia"],
                defaults=values,
            )
            obras[obra.referencia] = obra

        visitas = [
            {
                "obra": obras["CSJA-2026-001"],
                "inspector": "Eng.ª Isabel Manuel",
                "data_visita": today - timedelta(days=1),
                "progresso": "72.00",
                "qualidade": Fiscalizacao.Qualidade.CONFORME,
                "observacoes": "Estrutura e cobertura conformes. Confirmar entrega das caixilharias.",
                "proxima_visita": today + timedelta(days=6),
            },
            {
                "obra": obras["CSJA-2026-002"],
                "inspector": "Eng. Paulo Domingos",
                "data_visita": today - timedelta(days=2),
                "progresso": "48.00",
                "qualidade": Fiscalizacao.Qualidade.ATENCAO,
                "observacoes": "Ritmo de execução abaixo do plano; empreiteiro deve mobilizar equipa adicional.",
                "proxima_visita": today + timedelta(days=3),
            },
            {
                "obra": obras["CSJA-2026-003"],
                "inspector": "Eng.ª Teresa Joaquim",
                "data_visita": today - timedelta(days=5),
                "progresso": "94.00",
                "qualidade": Fiscalizacao.Qualidade.CONFORME,
                "observacoes": "Acabamentos em curso. Aguardar ensaio da instalação eléctrica.",
                "proxima_visita": today + timedelta(days=4),
            },
        ]
        for visita in visitas:
            Fiscalizacao.objects.update_or_create(
                obra=visita["obra"],
                data_visita=visita["data_visita"],
                defaults=visita,
            )

        ocorrencias = [
            {
                "obra": obras["CSJA-2026-002"],
                "titulo": "Atraso no fornecimento de manilhas",
                "descricao": "O fornecimento incompleto está a limitar a conclusão da drenagem no troço norte.",
                "gravidade": Ocorrencia.Gravidade.ALTA,
                "estado": Ocorrencia.Estado.EM_RESOLUCAO,
                "data_registo": today - timedelta(days=4),
                "prazo_resolucao": today + timedelta(days=2),
            },
            {
                "obra": obras["CSJA-2026-001"],
                "titulo": "Substituição de quadro eléctrico",
                "descricao": "O material entregue não corresponde à especificação técnica aprovada.",
                "gravidade": Ocorrencia.Gravidade.MEDIA,
                "estado": Ocorrencia.Estado.ABERTA,
                "data_registo": today - timedelta(days=2),
                "prazo_resolucao": today + timedelta(days=5),
            },
            {
                "obra": obras["CSJA-2026-003"],
                "titulo": "Ajuste de acessibilidade na entrada principal",
                "descricao": "A inclinação da rampa precisa de ajuste antes da recepção provisória.",
                "gravidade": Ocorrencia.Gravidade.CRITICA,
                "estado": Ocorrencia.Estado.ABERTA,
                "data_registo": today - timedelta(days=1),
                "prazo_resolucao": today + timedelta(days=3),
            },
        ]
        for occurrence in ocorrencias:
            Ocorrencia.objects.update_or_create(
                obra=occurrence["obra"],
                titulo=occurrence["titulo"],
                defaults=occurrence,
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Dados demonstrativos criados: 3 obras, 3 fiscalizações e 3 ocorrências."
            )
        )