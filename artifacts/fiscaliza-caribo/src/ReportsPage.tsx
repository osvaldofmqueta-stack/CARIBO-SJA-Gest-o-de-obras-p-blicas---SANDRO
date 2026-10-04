import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileBarChart2,
  Printer,
} from 'lucide-react';
import {
  useGetDashboard,
  useListFiscalizacoes,
  useListObras,
  useListOcorrencias,
} from '@workspace/api-client-react';

type ReportType = 'carteira' | 'obra' | 'semanal' | 'orcamento';
type Obra = {
  id: number;
  referencia: string;
  nome: string;
  descricao: string;
  provincia: string;
  municipio: string;
  empreiteiro: string;
  valor_contrato: number;
  valor_pago: number;
  progresso: number;
  estado: string;
  data_inicio: string;
  prazo_conclusao: string;
};
type Fiscalizacao = {
  id: number;
  obra_id: number;
  obra_nome: string;
  inspector: string;
  data_visita: string;
  progresso: number;
  qualidade: string;
  observacoes: string;
  proxima_visita: string | null;
};
type Ocorrencia = {
  id: number;
  obra_id: number;
  obra_nome: string;
  titulo: string;
  descricao: string;
  gravidade: string;
  estado: string;
  data_registo: string;
  prazo_resolucao: string | null;
};

const statusText: Record<string, string> = {
  ativa: 'Em curso',
  em_curso: 'Em curso',
  em_execucao: 'Em curso',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
  suspensa: 'Suspensa',
  planeada: 'Planeada',
  aberta: 'Aberta',
  em_resolucao: 'Em resolução',
  resolvida: 'Resolvida',
  conforme: 'Conforme',
  atencao: 'Atenção',
  nao_conforme: 'Não conforme',
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const money = (value: number) =>
  new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace('AOA', 'Kz');

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-AO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : '—';

function inputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentWeekStart() {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return inputDate(value);
}

function addDays(value: string, days: number) {
  const result = new Date(`${value}T12:00:00`);
  result.setDate(result.getDate() + days);
  return inputDate(result);
}

function Badge({ value }: { value: string }) {
  const tone =
    value === 'critica' ||
    value === 'alta' ||
    value === 'atrasada' ||
    value === 'nao_conforme'
      ? 'red'
      : value === 'media' || value === 'atencao' || value === 'em_resolucao'
        ? 'amber'
        : value === 'resolvida' ||
            value === 'conforme' ||
            value === 'concluida'
          ? 'green'
          : 'neutral';
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {statusText[value] || value}
    </span>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <span style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <b>{value}%</b>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <article className="surface report-summary-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </article>
  );
}

function NoRows({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="report-empty">
      <CheckCircle2 size={18} />
      <div>
        <b>{title}</b>
        <span>{copy}</span>
      </div>
    </div>
  );
}

function ReportTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const dashboard = useGetDashboard();
  const obrasQuery = useListObras();
  const fiscalizacoesQuery = useListFiscalizacoes();
  const ocorrenciasQuery = useListOcorrencias();
  const [type, setType] = useState<ReportType>('carteira');
  const [obraId, setObraId] = useState('');
  const [weekStart, setWeekStart] = useState(currentWeekStart);

  const loading =
    dashboard.isLoading ||
    obrasQuery.isLoading ||
    fiscalizacoesQuery.isLoading ||
    ocorrenciasQuery.isLoading;
  const error =
    !!dashboard.error ||
    !!obrasQuery.error ||
    !!fiscalizacoesQuery.error ||
    !!ocorrenciasQuery.error;
  const obras: Obra[] = obrasQuery.data || [];
  const fiscalizacoes: Fiscalizacao[] = fiscalizacoesQuery.data || [];
  const ocorrencias: Ocorrencia[] = ocorrenciasQuery.data || [];
  const selectedObra = obras.find((obra) => String(obra.id) === obraId);
  const weekEnd = addDays(weekStart, 6);
  const activeWorks = obras.filter(
    (obra) => obra.estado !== 'concluida' && obra.estado !== 'suspensa',
  );

  const obraFiscalizacoes = fiscalizacoes
    .filter((item) => item.obra_id === selectedObra?.id)
    .sort((a, b) => b.data_visita.localeCompare(a.data_visita));
  const obraOcorrencias = ocorrencias
    .filter((item) => item.obra_id === selectedObra?.id)
    .sort((a, b) => b.data_registo.localeCompare(a.data_registo));
  const weeklyFiscalizacoes = fiscalizacoes
    .filter(
      (item) => item.data_visita >= weekStart && item.data_visita <= weekEnd,
    )
    .sort(
      (a, b) =>
        a.data_visita.localeCompare(b.data_visita) || a.id - b.id,
    );
  const weeklyOcorrencias = ocorrencias
    .filter(
      (item) => item.data_registo >= weekStart && item.data_registo <= weekEnd,
    )
    .sort((a, b) => a.data_registo.localeCompare(b.data_registo));
  const visitedWorks = new Set(
    weeklyFiscalizacoes.map((item) => item.obra_id),
  ).size;
  const averageWeeklyProgress = weeklyFiscalizacoes.length
    ? Math.round(
        weeklyFiscalizacoes.reduce((total, item) => total + item.progresso, 0) /
          weeklyFiscalizacoes.length,
      )
    : 0;
  const totalContract = obras.reduce(
    (total, obra) => total + obra.valor_contrato,
    0,
  );
  const totalPaid = obras.reduce((total, obra) => total + obra.valor_pago, 0);
  const totalBalance = obras.reduce(
    (total, obra) =>
      total + Math.max(0, obra.valor_contrato - obra.valor_pago),
    0,
  );
  const financialRate = totalContract
    ? Math.round((totalPaid / totalContract) * 100)
    : 0;

  const reportTitle: Record<ReportType, string> = {
    carteira: 'Resumo geral da carteira',
    obra: selectedObra ? `Ficha da obra: ${selectedObra.nome}` : 'Ficha da obra',
    semanal: 'Acompanhamento semanal',
    orcamento: 'Situação orçamental',
  };
  const reportDescription: Record<ReportType, string> = {
    carteira: 'Resumo de todas as obras, valores, progresso e alertas.',
    obra: selectedObra
      ? `Dados, orçamento, fiscalizações e ocorrências de ${selectedObra.referencia}.`
      : 'Seleccione uma obra para preparar a sua ficha completa.',
    semanal: `Visitas e ocorrências entre ${date(weekStart)} e ${date(weekEnd)}.`,
    orcamento:
      'Comparação dos valores de contrato, pagamentos e saldo de cada obra.',
  };
  const printMeta =
    type === 'obra'
      ? selectedObra
        ? `${selectedObra.referencia} · ${selectedObra.municipio}, ${selectedObra.provincia}`
        : 'Seleccione uma obra'
      : type === 'semanal'
        ? `Período: ${date(weekStart)} a ${date(weekEnd)}`
        : type === 'orcamento'
          ? 'Valores acumulados até à data de emissão'
          : `${obras.length} obras · visão consolidada`;
  const canPrint =
    !loading &&
    !error &&
    ((type === 'obra' && !!selectedObra) ||
      (type !== 'obra' && !!dashboard.data));
  const helpText: Record<ReportType, string> = {
    carteira:
      'Mostra a carteira completa: investimento, progresso, atrasos e resumo por obra.',
    obra:
      'A ficha inclui contrato, pagamentos, progresso, visitas de fiscalização e ocorrências.',
    semanal:
      'Inclui as visitas e ocorrências registadas nos sete dias a partir da data escolhida.',
    orcamento:
      'Mostra o estado actual dos valores. O sistema ainda não guarda o histórico de pagamentos por mês.',
  };

  function comparisonFor(visit: Fiscalizacao) {
    const previous = fiscalizacoes
      .filter(
        (item) =>
          item.obra_id === visit.obra_id &&
          (item.data_visita < visit.data_visita ||
            (item.data_visita === visit.data_visita && item.id < visit.id)),
      )
      .sort(
        (a, b) =>
          b.data_visita.localeCompare(a.data_visita) || b.id - a.id,
      )[0];
    if (!previous) return null;
    return visit.progresso - previous.progresso;
  }

  function retry() {
    void dashboard.refetch();
    void obrasQuery.refetch();
    void fiscalizacoesQuery.refetch();
    void ocorrenciasQuery.refetch();
  }

  if (loading) {
    return (
      <div className="skeleton-stack" aria-label="A carregar relatórios">
        <div className="skeleton sk-wide" />
        <div className="skeleton sk-table" />
        <div className="skeleton sk-table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-panel error-panel">
        <h3>Não foi possível carregar os dados</h3>
        <p>Verifique a ligação ao serviço e tente novamente.</p>
        <button className="btn btn-secondary" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const statuses = Object.entries(
    obras.reduce<Record<string, number>>((result, obra) => {
      result[obra.estado] = (result[obra.estado] || 0) + 1;
      return result;
    }, {}),
  );

  return (
    <>
      <div className="report-print-brand">
        <b>CARIBO SJA</b>
        <span>Gestão e fiscalização de obras públicas</span>
        <span>
          {new Intl.DateTimeFormat('pt-AO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </span>
      </div>
      <div className="page-heading report-page-heading">
        <div>
          <div className="eyebrow">RELATÓRIOS DE OBRAS PÚBLICAS</div>
          <h1>{reportTitle[type]}</h1>
          <p>{reportDescription[type]}</p>
        </div>
        <div className="report-pdf-action">
          <button
            className="btn btn-primary"
            disabled={!canPrint}
            onClick={() => window.print()}
          >
            <Printer size={15} /> Emitir PDF
          </button>
          <small>
            Na janela seguinte, escolha «Guardar como PDF».
          </small>
        </div>
      </div>
      <div className="report-print-meta">{printMeta}</div>

      <section className="surface report-controls">
        <label className="report-control-field">
          <span>Que relatório pretende emitir?</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ReportType)}
          >
            <option value="carteira">Resumo geral da carteira</option>
            <option value="obra">Ficha de uma obra</option>
            <option value="semanal">Acompanhamento semanal</option>
            <option value="orcamento">Situação orçamental</option>
          </select>
        </label>
        {type === 'obra' && (
          <label className="report-control-field report-work-select">
            <span>Obra</span>
            <select
              value={obraId}
              onChange={(event) => setObraId(event.target.value)}
            >
              <option value="">Seleccione uma obra</option>
              {obras.map((obra) => (
                <option value={obra.id} key={obra.id}>
                  {obra.referencia} — {obra.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'semanal' && (
          <label className="report-control-field report-week-select">
            <span>Semana com início em</span>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </label>
        )}
        <div className="report-controls-help">
          <FileBarChart2 size={17} />
          <span>{helpText[type]}</span>
        </div>
      </section>

      {type === 'carteira' && dashboard.data && (
        <>
          <section className="report-topline">
            <article className="report-lead">
              <div className="eyebrow">INVESTIMENTO PÚBLICO</div>
              <div className="report-money">
                {money(dashboard.data.valor_contratual)}
              </div>
              <p>
                Valor contratual global distribuído por{' '}
                {dashboard.data.total_obras} obras registadas.
              </p>
              <div className="report-money-bar">
                <span
                  style={{
                    width: `${
                      dashboard.data.valor_contratual
                        ? Math.min(
                            100,
                            (dashboard.data.valor_pago /
                              dashboard.data.valor_contratual) *
                              100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="report-legend">
                <span>
                  Pago <b>{money(dashboard.data.valor_pago)}</b>
                </span>
                <span>
                  Saldo contratual{' '}
                  <b>
                    {money(
                      Math.max(
                        0,
                        dashboard.data.valor_contratual -
                          dashboard.data.valor_pago,
                      ),
                    )}
                  </b>
                </span>
              </div>
            </article>
            <article className="surface report-progress">
              <div className="eyebrow">PROGRESSO MÉDIO</div>
              <div className="progress-number">
                {dashboard.data.progresso_medio}
                <small>%</small>
              </div>
              <Progress value={dashboard.data.progresso_medio} />
              <div className="progress-caption">
                <span>{activeWorks.length} obras activas</span>
                <span>{dashboard.data.obras_atrasadas} em atraso</span>
              </div>
            </article>
          </section>
          <section className="report-columns">
            <article className="surface report-block">
              <div className="section-head">
                <div>
                  <div className="eyebrow">DISTRIBUIÇÃO</div>
                  <h2>Obras por estado</h2>
                </div>
                <Building2 size={19} />
              </div>
              {statuses.length ? (
                statuses.map(([status, count]) => (
                  <div className="distribution-row" key={status}>
                    <div className="distribution-label">
                      <Badge value={status} />
                      <b>{count}</b>
                    </div>
                    <div className="distribution-track">
                      <span
                        style={{
                          width: `${obras.length ? (count / obras.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <NoRows title="Sem obras" copy="Não existem obras registadas." />
              )}
            </article>
            <article className="surface report-block">
              <div className="section-head">
                <div>
                  <div className="eyebrow">ALERTAS DE GESTÃO</div>
                  <h2>Carteira em risco</h2>
                </div>
                <Activity size={19} />
              </div>
              <div className="risk-line">
                <span className="risk-icon red-icon">
                  <Clock3 size={17} />
                </span>
                <div>
                  <b>{dashboard.data.obras_atrasadas} obras atrasadas</b>
                  <small>Rever plano de recuperação e prazos</small>
                </div>
                <ArrowUpRight size={16} />
              </div>
              <div className="risk-line">
                <span className="risk-icon gold-icon">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <b>
                    {ocorrencias.filter((item) => item.estado !== 'resolvida')
                      .length}{' '}
                    ocorrências por resolver
                  </b>
                  <small>
                    {
                      ocorrencias.filter(
                        (item) =>
                          item.gravidade === 'critica' ||
                          item.gravidade === 'alta',
                      ).length
                    }{' '}
                    de gravidade elevada ou crítica
                  </small>
                </div>
                <ArrowUpRight size={16} />
              </div>
              <div className="risk-line">
                <span className="risk-icon teal-icon">
                  <CalendarDays size={17} />
                </span>
                <div>
                  <b>{fiscalizacoes.length} visitas registadas</b>
                  <small>
                    {dashboard.data.fiscalizacoes_mes} realizadas este mês
                  </small>
                </div>
                <ArrowDownRight size={16} />
              </div>
            </article>
          </section>
          <section className="surface table-surface">
            <div className="section-head">
              <div>
                <div className="eyebrow">EXECUÇÃO DETALHADA</div>
                <h2>Resumo por obra</h2>
              </div>
              <span className="result-count">{obras.length} obras</span>
            </div>
            {obras.length ? (
              <ReportTable
                headers={[
                  'Obra',
                  'Estado',
                  'Progresso',
                  'Contrato',
                  'Pago',
                  'Saldo',
                ]}
              >
                {obras.map((obra) => (
                  <tr key={obra.id}>
                    <td>
                      <b>{obra.nome}</b>
                      <small className="report-cell-sub">
                        {obra.referencia} · {obra.provincia}
                      </small>
                    </td>
                    <td>
                      <Badge value={obra.estado} />
                    </td>
                    <td>
                      <Progress value={obra.progresso} />
                    </td>
                    <td>{money(obra.valor_contrato)}</td>
                    <td>{money(obra.valor_pago)}</td>
                    <td>
                      {money(
                        Math.max(0, obra.valor_contrato - obra.valor_pago),
                      )}
                    </td>
                  </tr>
                ))}
              </ReportTable>
            ) : (
              <NoRows
                title="Sem obras registadas"
                copy="Adicione uma obra para criar o resumo da carteira."
              />
            )}
          </section>
        </>
      )}

      {type === 'obra' && selectedObra && (
        <>
          <section className="surface report-work-header">
            <div className="eyebrow">
              {selectedObra.referencia} · {selectedObra.municipio},{' '}
              {selectedObra.provincia}
            </div>
            <div className="report-work-titleline">
              <h2>{selectedObra.nome}</h2>
              <Badge value={selectedObra.estado} />
            </div>
            <p>
              {selectedObra.descricao || 'Sem descrição complementar registada.'}
            </p>
            <div className="report-work-meta">
              <span>
                <b>Empreiteiro:</b> {selectedObra.empreiteiro}
              </span>
              <span>
                <b>Início:</b> {date(selectedObra.data_inicio)}
              </span>
              <span>
                <b>Prazo:</b> {date(selectedObra.prazo_conclusao)}
              </span>
            </div>
          </section>
          <section className="detail-metrics report-detail-metrics">
            <div className="surface detail-metric">
              <small>Progresso físico</small>
              <strong>{selectedObra.progresso}%</strong>
              <Progress value={selectedObra.progresso} />
            </div>
            <div className="surface detail-metric">
              <small>Valor do contrato</small>
              <strong>{money(selectedObra.valor_contrato)}</strong>
              <span>Valor contratado</span>
            </div>
            <div className="surface detail-metric">
              <small>Valor pago</small>
              <strong>{money(selectedObra.valor_pago)}</strong>
              <span>
                {selectedObra.valor_contrato
                  ? Math.round(
                      (selectedObra.valor_pago / selectedObra.valor_contrato) *
                        100,
                    )
                  : 0}
                % do contrato
              </span>
            </div>
            <div className="surface detail-metric">
              <small>Saldo por executar</small>
              <strong>
                {money(
                  Math.max(
                    0,
                    selectedObra.valor_contrato - selectedObra.valor_pago,
                  ),
                )}
              </strong>
              <span>Prazo: {date(selectedObra.prazo_conclusao)}</span>
            </div>
          </section>
          <section className="surface table-surface report-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">ACOMPANHAMENTO DE CAMPO</div>
                <h2>Fiscalizações desta obra</h2>
              </div>
              <span className="result-count">
                {obraFiscalizacoes.length} visitas
              </span>
            </div>
            {obraFiscalizacoes.length ? (
              <ReportTable
                headers={[
                  'Data',
                  'Inspector',
                  'Progresso observado',
                  'Qualidade',
                  'Observações',
                ]}
              >
                {obraFiscalizacoes.map((visit) => (
                  <tr key={visit.id}>
                    <td>{date(visit.data_visita)}</td>
                    <td>{visit.inspector}</td>
                    <td>
                      <Progress value={visit.progresso} />
                    </td>
                    <td>
                      <Badge value={visit.qualidade} />
                    </td>
                    <td>{visit.observacoes || '—'}</td>
                  </tr>
                ))}
              </ReportTable>
            ) : (
              <NoRows
                title="Ainda sem fiscalizações"
                copy="As visitas desta obra aparecerão aqui quando forem registadas."
              />
            )}
          </section>
          <section className="surface table-surface report-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">PENDÊNCIAS</div>
                <h2>Ocorrências desta obra</h2>
              </div>
              <span className="result-count">
                {obraOcorrencias.length} ocorrências
              </span>
            </div>
            {obraOcorrencias.length ? (
              <ReportTable
                headers={[
                  'Ocorrência',
                  'Gravidade',
                  'Estado',
                  'Registada em',
                  'Prazo',
                ]}
              >
                {obraOcorrencias.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <b>{issue.titulo}</b>
                      <small className="report-cell-sub">
                        {issue.descricao}
                      </small>
                    </td>
                    <td>
                      <Badge value={issue.gravidade} />
                    </td>
                    <td>
                      <Badge value={issue.estado} />
                    </td>
                    <td>{date(issue.data_registo)}</td>
                    <td>{date(issue.prazo_resolucao)}</td>
                  </tr>
                ))}
              </ReportTable>
            ) : (
              <NoRows
                title="Sem ocorrências registadas"
                copy="Não há pendências registadas para esta obra."
              />
            )}
          </section>
        </>
      )}
      {type === 'obra' && !selectedObra && (
        <NoRows
          title={obras.length ? 'Seleccione uma obra' : 'Sem obras registadas'}
          copy={
            obras.length
              ? 'Escolha a obra no campo acima para preparar a ficha.'
              : 'Registe uma obra antes de emitir a sua ficha.'
          }
        />
      )}

      {type === 'semanal' && (
        <>
          <section className="report-summary-grid">
            <Stat
              label="Visitas na semana"
              value={weeklyFiscalizacoes.length}
              detail="Fiscalizações registadas no período"
            />
            <Stat
              label="Obras acompanhadas"
              value={visitedWorks}
              detail="Obras com pelo menos uma visita"
            />
            <Stat
              label="Progresso observado"
              value={`${averageWeeklyProgress}%`}
              detail="Média das visitas no período"
            />
            <Stat
              label="Ocorrências registadas"
              value={weeklyOcorrencias.length}
              detail="Novas ocorrências nesta semana"
            />
          </section>
          <section className="surface table-surface report-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">VISITAS DE CAMPO</div>
                <h2>Actividade semanal</h2>
              </div>
              <span className="result-count">
                {date(weekStart)} — {date(weekEnd)}
              </span>
            </div>
            {weeklyFiscalizacoes.length ? (
              <ReportTable
                headers={[
                  'Data',
                  'Obra',
                  'Inspector',
                  'Progresso',
                  'Variação desde a visita anterior',
                  'Qualidade',
                  'Observações',
                ]}
              >
                {weeklyFiscalizacoes.map((visit) => {
                  const delta = comparisonFor(visit);
                  return (
                    <tr key={visit.id}>
                      <td>{date(visit.data_visita)}</td>
                      <td>
                        <b>{visit.obra_nome}</b>
                      </td>
                      <td>{visit.inspector}</td>
                      <td>
                        <Progress value={visit.progresso} />
                      </td>
                      <td>
                        {delta === null ? (
                          <span className="report-muted">
                            Sem visita anterior
                          </span>
                        ) : (
                          <span
                            className={
                              delta > 0
                                ? 'report-positive'
                                : delta < 0
                                  ? 'report-negative'
                                  : 'report-muted'
                            }
                          >
                            {delta > 0 ? '+' : ''}
                            {delta} p.p.
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge value={visit.qualidade} />
                      </td>
                      <td>{visit.observacoes || '—'}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            ) : (
              <NoRows
                title="Sem visitas nesta semana"
                copy="Altere a data de início ou emita o relatório para uma semana com fiscalizações registadas."
              />
            )}
          </section>
          <section className="surface table-surface report-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">NOVAS PENDÊNCIAS</div>
                <h2>Ocorrências registadas na semana</h2>
              </div>
              <span className="result-count">
                {weeklyOcorrencias.length} ocorrências
              </span>
            </div>
            {weeklyOcorrencias.length ? (
              <ReportTable
                headers={[
                  'Data',
                  'Obra',
                  'Ocorrência',
                  'Gravidade',
                  'Estado',
                  'Prazo',
                ]}
              >
                {weeklyOcorrencias.map((issue) => (
                  <tr key={issue.id}>
                    <td>{date(issue.data_registo)}</td>
                    <td>{issue.obra_nome}</td>
                    <td>
                      <b>{issue.titulo}</b>
                      <small className="report-cell-sub">
                        {issue.descricao}
                      </small>
                    </td>
                    <td>
                      <Badge value={issue.gravidade} />
                    </td>
                    <td>
                      <Badge value={issue.estado} />
                    </td>
                    <td>{date(issue.prazo_resolucao)}</td>
                  </tr>
                ))}
              </ReportTable>
            ) : (
              <NoRows
                title="Sem novas ocorrências nesta semana"
                copy="Não foram registadas ocorrências no período seleccionado."
              />
            )}
          </section>
        </>
      )}

      {type === 'orcamento' && (
        <>
          <section className="report-summary-grid">
            <Stat
              label="Valor contratado"
              value={money(totalContract)}
              detail={`${obras.length} obras na carteira`}
            />
            <Stat
              label="Valor pago"
              value={money(totalPaid)}
              detail="Pagamentos acumulados registados"
            />
            <Stat
              label="Saldo contratual"
              value={money(totalBalance)}
              detail="Valor ainda por pagar"
            />
            <Stat
              label="Execução financeira"
              value={`${financialRate}%`}
              detail="Pago sobre o valor contratado"
            />
          </section>
          <section className="surface table-surface report-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">SITUAÇÃO ACTUAL</div>
                <h2>Orçamento por obra</h2>
              </div>
              <span className="result-count">{obras.length} obras</span>
            </div>
            {obras.length ? (
              <ReportTable
                headers={[
                  'Obra',
                  'Estado',
                  'Progresso físico',
                  'Valor contratado',
                  'Valor pago',
                  'Saldo',
                  'Execução financeira',
                ]}
              >
                {obras.map((obra) => {
                  const rate = obra.valor_contrato
                    ? Math.round(
                        (obra.valor_pago / obra.valor_contrato) * 100,
                      )
                    : 0;
                  return (
                    <tr key={obra.id}>
                      <td>
                        <b>{obra.nome}</b>
                        <small className="report-cell-sub">
                          {obra.referencia} · {obra.provincia}
                        </small>
                      </td>
                      <td>
                        <Badge value={obra.estado} />
                      </td>
                      <td>
                        <Progress value={obra.progresso} />
                      </td>
                      <td>{money(obra.valor_contrato)}</td>
                      <td>{money(obra.valor_pago)}</td>
                      <td>
                        {money(
                          Math.max(0, obra.valor_contrato - obra.valor_pago),
                        )}
                      </td>
                      <td>{rate}%</td>
                    </tr>
                  );
                })}
              </ReportTable>
            ) : (
              <NoRows
                title="Sem obras registadas"
                copy="Adicione obras para consultar a situação orçamental."
              />
            )}
          </section>
          <p className="report-data-note">
            Este relatório apresenta os valores acumulados registados no sistema
            na data da emissão. Não representa uma série histórica mensal.
          </p>
        </>
      )}
    </>
  );
}