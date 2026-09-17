import { AdditionalsModule } from './AdditionalsModule';
import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BadgeDollarSign,
  CircleDollarSign,
  ClipboardList,
  FileSpreadsheet,
  History,
  Plus,
  Save,
  SquarePen,
  Trash2,
  Users
} from 'lucide-react';
import { supabase } from './supabase';
import {
  buildPreparedQuote,
  ClientsModule,
  CotizadorHome,
  createQuoteDraft,
  initialAdditionals,
  initialClients,
  initialClientTypes,
  initialQuoteStatuses,
  initialRequiredActions,
  QuotesModule,
  type AdditionalDefinition,
  type Client,
  type PreparedQuote,
  type QuoteStatus,
  type TransportQuoteDraft
} from './crmFeature';
type CostAllocation = {
  perDay: boolean;
  perKm: boolean;
};

type CostLine = {
  id: string;
  name: string;
  daySourceValue: number;
  dayFadeeacIndex: number;
  kmSourceValue: number;
  kmFadeeacIndex: number;
  allocation: CostAllocation;
};

type CostSnapshot = {
  id: string;
  month: string;
  year: string;
  savedAt: string;
  lines: CostLine[];
};

type CostTotals = {
  perDay: number;
  perKm: number;
};

type CostComparison = {
  previousLabel: string;
  perDayPercent?: number;
  perKmPercent?: number;
};

type CostStructureRow = {
  id: string;
  month: number;
  year: number;
  saved_at: string;
};

type CostItemRow = {
  structure_id: string;
  category_id: string;
  day_source_value: number | string | null;
  day_fadeeac_index: number | string | null;
  km_source_value: number | string | null;
  km_fadeeac_index: number | string | null;
  source_value?: number | string | null;
  fadeeac_index?: number | string | null;
  applies_per_day: boolean;
  applies_per_km: boolean;
  sort_order: number | null;
  cost_categories?: {
    name: string;
    sort_order: number | null;
  } | {
    name: string;
    sort_order: number | null;
  }[] | null;
};


const initialCostLines: CostLine[] = [
  { id: 'combustible', name: 'Combustible', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 340000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'lubricantes', name: 'Lubricantes', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 52000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'neumaticos', name: 'Neumaticos', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 118000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'reparaciones', name: 'Reparaciones', daySourceValue: 165000, dayFadeeacIndex: 0, kmSourceValue: 165000, kmFadeeacIndex: 0, allocation: { perDay: true, perKm: true } },
  { id: 'material-rodante', name: 'Material Rodante', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 260000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'personal', name: 'Personal', daySourceValue: 980000, dayFadeeacIndex: 0, kmSourceValue: 0, kmFadeeacIndex: 0, allocation: { perDay: true, perKm: false } },
  { id: 'seguros', name: 'Seguros', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 126000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'patentes-tasas', name: 'Patentes y tasas', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 76000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'costo-financiero', name: 'Costo Financiero', daySourceValue: 94000, dayFadeeacIndex: 0, kmSourceValue: 94000, kmFadeeacIndex: 0, allocation: { perDay: true, perKm: true } },
  { id: 'gastos-generales', name: 'Gastos Generales', daySourceValue: 0, dayFadeeacIndex: 0, kmSourceValue: 210000, kmFadeeacIndex: 0, allocation: { perDay: false, perKm: true } }
];


const months = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});

function App() {
  const today = new Date();
  const [view, setView] = useState<'cotizador' | 'clientes' | 'cotizaciones' | 'costos' | 'adicionales'>('cotizador');
  const [month] = useState(months[today.getMonth()]);
  const [year] = useState(String(today.getFullYear()));
  const [lookupMonth, setLookupMonth] = useState(months[today.getMonth()]);
  const [lookupYear, setLookupYear] = useState(String(today.getFullYear()));
  const [costLines, setCostLines] = useState<CostLine[]>(initialCostLines);
  const [snapshots, setSnapshots] = useState<CostSnapshot[]>([]);
  const [isCostEditing, setIsCostEditing] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Sin guardar en esta sesion');
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [clientTypes, setClientTypes] = useState(initialClientTypes);
  const [quoteStatuses, setQuoteStatuses] = useState<QuoteStatus[]>(initialQuoteStatuses);
  const [requiredActions, setRequiredActions] = useState(initialRequiredActions);
  const [additionalCatalog, setAdditionalCatalog] = useState<AdditionalDefinition[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('servintar.additionalCatalog.v1') ?? 'null');
      if (Array.isArray(saved) && saved.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.description === 'string' && ['fixed','percent'].includes(item.kind))) return saved;
    } catch { /* Fall back to the initial catalog if storage is unavailable. */ }
    return initialAdditionals;
  });
  const [additionalStatus, setAdditionalStatus] = useState('');
  const saveAdditionalCatalog = (items: AdditionalDefinition[]) => {
    try { localStorage.setItem('servintar.additionalCatalog.v1', JSON.stringify(items)); }
    catch { setAdditionalStatus('No se pudo guardar el catálogo en este navegador. No se aplicaron los cambios.'); return false; }
    setAdditionalCatalog(items); setAdditionalStatus('Catálogo guardado.'); return true;
  };
  const [quotes, setQuotes] = useState<PreparedQuote[]>([]);
  const [quoteDraft, setQuoteDraft] = useState<TransportQuoteDraft>(() => createQuoteDraft(initialClients[0]?.id ?? ''));

  const totals = useMemo(() => calculateTotals(costLines), [costLines]);
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.month === lookupMonth && snapshot.year === lookupYear);
  const currentSnapshot = snapshots.find((snapshot) => snapshot.month === month && snapshot.year === year);
  const previousComparison = useMemo(() => {
    const previousPeriod = getPreviousPeriod(month, year);
    const previousSnapshot = snapshots.find(
      (snapshot) => snapshot.month === previousPeriod.month && snapshot.year === previousPeriod.year
    );

    return calculateComparison(totals, previousPeriod, previousSnapshot);
  }, [month, snapshots, totals, year]);

  useEffect(() => {
    void loadMonthlyCostStructures();
  }, []);

  const loadMonthlyCostStructures = async () => {
    if (!supabase) {
      return;
    }

    const { data: structures, error: structuresError } = await supabase
      .from('monthly_cost_structures')
      .select('id, month, year, saved_at')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (structuresError) {
      setSaveStatus('Supabase conectado, pero no se pudieron leer las tablas de costos.');
      return;
    }

    const structureRows = (structures ?? []) as CostStructureRow[];

    if (structureRows.length === 0) {
      setSaveStatus('Supabase conectado. Todavia no hay meses guardados.');
      return;
    }

    const { data: items, error: itemsError } = await supabase
      .from('monthly_cost_items')
      .select(
        'structure_id, category_id, day_source_value, day_fadeeac_index, km_source_value, km_fadeeac_index, source_value, fadeeac_index, applies_per_day, applies_per_km, sort_order, cost_categories(name, sort_order)'
      )
      .in(
        'structure_id',
        structureRows.map((structure) => structure.id)
      );

    if (itemsError) {
      setSaveStatus('Supabase conectado, pero falta actualizar el esquema normalizado de costos.');
      return;
    }

    const itemRows = (items ?? []) as unknown as CostItemRow[];
    const loadedSnapshots = structureRows.map((structure) =>
      mapSnapshotFromRows(
        structure,
        itemRows.filter((item) => item.structure_id === structure.id)
      )
    );

    const loadedCurrentSnapshot = loadedSnapshots.find((snapshot) => snapshot.month === month && snapshot.year === year);
    setSnapshots(loadedSnapshots);

    if (loadedCurrentSnapshot) {
      setCostLines(loadedCurrentSnapshot.lines);
      setIsCostEditing(false);
      setSaveStatus('Datos cargados desde Supabase.');
    } else {
      setSaveStatus('Supabase conectado. Mes vigente pendiente de guardar.');
    }
  };

  const updateLine = (
    id: string,
    field: 'daySourceValue' | 'dayFadeeacIndex' | 'kmSourceValue' | 'kmFadeeacIndex',
    value: string
  ) => {
    setCostLines((currentLines) =>
      currentLines.map((line) =>
        line.id === id
          ? {
              ...line,
              [field]: Number(value)
            }
          : line
      )
    );
  };

  const updateLineName = (id: string, value: string) => {
    setCostLines((currentLines) => currentLines.map((line) => (line.id === id ? { ...line, name: value } : line)));
  };

  const updateAllocation = (id: string, field: keyof CostAllocation, checked: boolean) => {
    setCostLines((currentLines) =>
      currentLines.map((line) =>
        line.id === id
          ? {
              ...line,
              allocation: {
                ...line.allocation,
                [field]: checked
              }
            }
          : line
      )
    );
  };

  const addCostLine = () => {
    setCostLines((currentLines) => [
      ...currentLines,
      {
        id: `costo-${Date.now()}`,
        name: 'Nuevo costo',
        daySourceValue: 0,
        dayFadeeacIndex: 0,
        kmSourceValue: 0,
        kmFadeeacIndex: 0,
        allocation: {
          perDay: false,
          perKm: true
        }
      }
    ]);
  };

  const deleteCostLine = (id: string) => {
    setCostLines((currentLines) => currentLines.filter((line) => line.id !== id));
  };

  const saveClient = (client: Client) => {
    setClients((currentClients) => {
      const exists = currentClients.some((item) => item.id === client.id);
      return exists ? currentClients.map((item) => (item.id === client.id ? client : item)) : [client, ...currentClients];
    });
    setQuoteDraft((currentDraft) => ({ ...currentDraft, clientId: currentDraft.clientId || client.id }));
  };

  const deleteClient = (id: string) => {
    setClients((currentClients) => currentClients.filter((client) => client.id !== id));
    setQuotes((currentQuotes) => currentQuotes.filter((quoteItem) => quoteItem.clientId !== id));
    setQuoteDraft((currentDraft) => ({
      ...currentDraft,
      clientId: currentDraft.clientId === id ? clients.find((client) => client.id !== id)?.id ?? '' : currentDraft.clientId
    }));
  };

  const prepareQuote = () => {
    const preparedQuote = buildPreparedQuote(quoteDraft, clients, totals);
    setQuotes((currentQuotes) => [preparedQuote, ...currentQuotes]);
    setQuoteDraft((currentDraft) => ({
      ...currentDraft,
      state: 'Pendiente de envio',
      requiredAction: 'Enviar al cliente'
    }));
    setView('cotizaciones');
  };

  const saveMonthlySnapshot = async () => {
    const snapshot: CostSnapshot = {
      id: `${year}-${month}-${Date.now()}`,
      month,
      year,
      savedAt: new Date().toISOString(),
      lines: costLines.map((line) => ({ ...line, allocation: { ...line.allocation } }))
    };

    setSnapshots((currentSnapshots) => [
      snapshot,
      ...currentSnapshots.filter((item) => !(item.month === month && item.year === year))
    ]);
    setLookupMonth(month);
    setLookupYear(year);
    setIsCostEditing(false);

    if (!supabase) {
      setSaveStatus('Guardado local. Supabase no esta configurado.');
      return;
    }

    const { error: categoryError } = await supabase.from('cost_categories').upsert(
      costLines.map((line, index) => ({
        id: line.id,
        name: line.name,
        sort_order: (index + 1) * 10
      })),
      { onConflict: 'id' }
    );

    if (categoryError) {
      setSaveStatus('No se pudieron actualizar los rubros en Supabase.');
      return;
    }

    const { data: structure, error: structureError } = await supabase
      .from('monthly_cost_structures')
      .upsert(
        {
          month: months.indexOf(month) + 1,
          year: Number(year),
          saved_at: new Date().toISOString()
        },
        { onConflict: 'month,year' }
      )
      .select('id')
      .single();

    if (structureError || !structure) {
      setSaveStatus('No se pudo guardar en Supabase. Revisar tablas y politicas.');
      return;
    }

    const { error: deleteError } = await supabase.from('monthly_cost_items').delete().eq('structure_id', structure.id);

    if (deleteError) {
      setSaveStatus('No se pudo reemplazar el detalle mensual en Supabase.');
      return;
    }

    const { error: itemError } = await supabase.from('monthly_cost_items').insert(
      costLines.map((line, index) => ({
        structure_id: structure.id,
        category_id: line.id,
        day_source_value: line.daySourceValue,
        day_fadeeac_index: line.dayFadeeacIndex,
        day_updated_value: getUpdatedValue(line, 'day'),
        km_source_value: line.kmSourceValue,
        km_fadeeac_index: line.kmFadeeacIndex,
        km_updated_value: getUpdatedValue(line, 'km'),
        source_value: line.kmSourceValue || line.daySourceValue,
        fadeeac_index: line.kmFadeeacIndex || line.dayFadeeacIndex,
        updated_value: getUpdatedValue(line, 'km') || getUpdatedValue(line, 'day'),
        applies_per_day: line.allocation.perDay,
        applies_per_km: line.allocation.perKm,
        sort_order: (index + 1) * 10
      }))
    );

    setSaveStatus(itemError ? 'No se pudieron guardar los items en Supabase.' : 'Guardado en Supabase correctamente.');
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BadgeDollarSign size={24} />
          </div>
          <div>
            <strong>CRM Servintar</strong>
            <span>Gestión de transporte</span>
          </div>
        </div>

        <div>
          <p className="nav-section-label">Espacio de trabajo</p>
        <nav className="nav-list" aria-label="Principal">
          <button className={`nav-item ${view === 'cotizador' ? 'active' : ''}`} onClick={() => setView('cotizador')} aria-current={view === 'cotizador' ? 'page' : undefined} type="button">
            <CircleDollarSign size={18} />
            Cotizador
          </button>
          <button className={`nav-item ${view === 'clientes' ? 'active' : ''}`} onClick={() => setView('clientes')} aria-current={view === 'clientes' ? 'page' : undefined} type="button">
            <Users size={18} />
            Clientes
          </button>
          <button className={`nav-item ${view === 'cotizaciones' ? 'active' : ''}`} onClick={() => setView('cotizaciones')} aria-current={view === 'cotizaciones' ? 'page' : undefined} type="button">
            <ClipboardList size={18} />
            Cotizaciones
          </button>
          <button className={`nav-item ${view === 'costos' ? 'active' : ''}`} onClick={() => setView('costos')} aria-current={view === 'costos' ? 'page' : undefined} type="button">
            <FileSpreadsheet size={18} />
            Estructura de costos
          </button>
          <button className={`nav-item ${view === 'adicionales' ? 'active' : ''}`} onClick={() => setView('adicionales')} aria-current={view === 'adicionales' ? 'page' : undefined} type="button"><Plus size={18} />Adicionales</button>
        </nav>
        </div>
        <div className="sidebar-footer">
          <strong>Todo listo para avanzar</strong>
          <span>Clientes, costos y cotizaciones en un solo lugar.</span>
        </div>

      </aside>

      <section className="workspace" key={view}>
        {view === 'cotizador' && (
          <CotizadorHome
            additionalCatalog={additionalCatalog}
            clients={clients}
            draft={quoteDraft}
            previousQuotes={quotes}
            onDraftChange={setQuoteDraft}
            onPrepareQuote={prepareQuote}
            totals={totals}
          />
        )}
        {view === 'adicionales' && <AdditionalsModule catalog={additionalCatalog} onChange={saveAdditionalCatalog} status={additionalStatus} />}
        {view === 'clientes' && (
          <ClientsModule
            clientTypes={clientTypes}
            clients={clients}
            onClientTypesChange={setClientTypes}
            onDeleteClient={deleteClient}
            onSaveClient={saveClient}
          />
        )}
        {view === 'cotizaciones' && (
          <QuotesModule
            clients={clients}
            onRequiredActionsChange={setRequiredActions}
            onStatusesChange={setQuoteStatuses}
            quotes={quotes}
            requiredActions={requiredActions}
            statuses={quoteStatuses}
          />
        )}
        {view === 'costos' && (
          <CostStructure
            costLines={costLines}
            isCostEditing={isCostEditing}
            isCurrentMonthReady={Boolean(currentSnapshot)}
            lookupMonth={lookupMonth}
            lookupYear={lookupYear}
            month={month}
            onAllocationChange={updateAllocation}
            onAddLine={addCostLine}
            onBack={() => setView('cotizador')}
            onDeleteLine={deleteCostLine}
            onEdit={() => setIsCostEditing(true)}
            onLineChange={updateLine}
            onLineNameChange={updateLineName}
            onLookupMonthChange={setLookupMonth}
            onLookupYearChange={setLookupYear}
            onSave={saveMonthlySnapshot}
            previousComparison={previousComparison}
            selectedSnapshot={selectedSnapshot}
            totals={totals}
            year={year}
          />
        )}
      </section>
    </main>
  );
}

type CostStructureProps = {
  costLines: CostLine[];
  isCostEditing: boolean;
  isCurrentMonthReady: boolean;
  lookupMonth: string;
  lookupYear: string;
  month: string;
  onAllocationChange: (id: string, field: keyof CostAllocation, checked: boolean) => void;
  onAddLine: () => void;
  onBack: () => void;
  onDeleteLine: (id: string) => void;
  onEdit: () => void;
  onLineChange: (
    id: string,
    field: 'daySourceValue' | 'dayFadeeacIndex' | 'kmSourceValue' | 'kmFadeeacIndex',
    value: string
  ) => void;
  onLineNameChange: (id: string, value: string) => void;
  onLookupMonthChange: (month: string) => void;
  onLookupYearChange: (year: string) => void;
  onSave: () => void;
  previousComparison: CostComparison;
  selectedSnapshot?: CostSnapshot;
  totals: CostTotals;
  year: string;
};

function CostStructure({
  costLines,
  isCostEditing,
  isCurrentMonthReady,
  lookupMonth,
  lookupYear,
  month,
  onAllocationChange,
  onAddLine,
  onBack,
  onDeleteLine,
  onEdit,
  onLineChange,
  onLineNameChange,
  onLookupMonthChange,
  onLookupYearChange,
  onSave,
  previousComparison,
  selectedSnapshot,
  totals,
  year
}: CostStructureProps) {
  const snapshotTotals = selectedSnapshot ? calculateTotals(selectedSnapshot.lines) : null;
  const isLocked = isCurrentMonthReady && !isCostEditing;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Cotizador</p>
          <h1>Estructura de costos</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={onBack} type="button">
            <CircleDollarSign size={17} />
            Volver al cotizador
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Totales de estructura">
        <Metric label="Mes vigente" value={`${month} ${year}`} hint={isCurrentMonthReady ? 'Habilitado para cotizar' : 'Pendiente de guardar'} />
        <Metric label="Costo por dia" value={currency.format(totals.perDay)} hint="Items marcados por dia" />
        <Metric
          label="Incremento dia"
          value={formatPercentChange(previousComparison.perDayPercent)}
          hint={`Contra ${previousComparison.previousLabel}`}
        />
        <Metric label="Costo por km" value={currency.format(totals.perKm)} hint="Items marcados por kilometro" />
        <Metric
          label="Incremento km"
          value={formatPercentChange(previousComparison.perKmPercent)}
          hint={`Contra ${previousComparison.previousLabel}`}
        />
      </section>

      <section className="panel costs-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Planilla mensual</p>
            <h2>Costos de origen e indice FADEEAC</h2>
          </div>
          <div className="cost-actions">
            {isLocked ? (
              <button className="ghost-button" onClick={onEdit} type="button">
                <SquarePen size={17} />
                Edicion
              </button>
            ) : (
              <button className="ghost-button" onClick={onAddLine} type="button">
                <Plus size={17} />
                Agregar linea
              </button>
            )}
            <button className="primary-button" disabled={isLocked} onClick={onSave} type="button">
              <Save size={18} />
              Guardar mes completo
            </button>
          </div>
        </div>

        <div className="cost-table">
          <div className={`cost-row cost-head ${isLocked ? 'cost-row-locked' : ''}`}>
            <span>Rubro</span>
            <span>x dia</span>
            {isLocked ? null : (
              <>
                <span>Costo origen</span>
                <span>FADEEAC</span>
              </>
            )}
            <span>Costo diario</span>
            <span>x km</span>
            {isLocked ? null : (
              <>
                <span>Costo origen</span>
                <span>FADEEAC</span>
              </>
            )}
            <span>Costo km</span>
            {isLocked ? null : <span>Acciones</span>}
          </div>
          {costLines.map((line) => {
            const dailyValue = line.allocation.perDay ? getUpdatedValue(line, 'day') : 0;
            const kmValue = line.allocation.perKm ? getUpdatedValue(line, 'km') : 0;

            return (
              <div className={`cost-row ${isLocked ? 'cost-row-locked' : ''}`} key={line.id}>
                <input className="rubric-input" disabled={isLocked} value={line.name} onChange={(event) => onLineNameChange(line.id, event.target.value)} />
                <label className="check-cell">
                  <input
                    checked={line.allocation.perDay}
                    disabled={isLocked}
                    type="checkbox"
                    onChange={(event) => onAllocationChange(line.id, 'perDay', event.target.checked)}
                  />
                </label>
                {isLocked ? null : (
                  <>
                    <input
                      disabled={!line.allocation.perDay}
                      min="0"
                      type="number"
                      value={line.daySourceValue}
                      onChange={(event) => onLineChange(line.id, 'daySourceValue', event.target.value)}
                    />
                    <input
                      disabled={!line.allocation.perDay}
                      step="0.01"
                      type="number"
                      value={line.dayFadeeacIndex}
                      onChange={(event) => onLineChange(line.id, 'dayFadeeacIndex', event.target.value)}
                    />
                  </>
                )}
                <span className={`allocation-value ${line.allocation.perDay ? '' : 'inactive'}`}>
                  {line.allocation.perDay ? currency.format(dailyValue) : 'No aplica'}
                </span>
                <label className="check-cell">
                  <input
                    checked={line.allocation.perKm}
                    disabled={isLocked}
                    type="checkbox"
                    onChange={(event) => onAllocationChange(line.id, 'perKm', event.target.checked)}
                  />
                </label>
                {isLocked ? null : (
                  <>
                    <input
                      disabled={!line.allocation.perKm}
                      min="0"
                      type="number"
                      value={line.kmSourceValue}
                      onChange={(event) => onLineChange(line.id, 'kmSourceValue', event.target.value)}
                    />
                    <input
                      disabled={!line.allocation.perKm}
                      step="0.01"
                      type="number"
                      value={line.kmFadeeacIndex}
                      onChange={(event) => onLineChange(line.id, 'kmFadeeacIndex', event.target.value)}
                    />
                  </>
                )}
                <span className={`allocation-value ${line.allocation.perKm ? '' : 'inactive'}`}>
                  {line.allocation.perKm ? currency.format(kmValue) : 'No aplica'}
                </span>
                {isLocked ? null : (
                  <button
                    aria-label={`Eliminar ${line.name}`}
                    className="icon-button danger-button"
                    type="button"
                    onClick={() => onDeleteLine(line.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="history-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Historico</p>
              <h2>Consultar tabla guardada</h2>
            </div>
            <History size={20} />
          </div>

          <div className="period-controls history-controls">
            <label>
              Mes
              <select value={lookupMonth} onChange={(event) => onLookupMonthChange(event.target.value)}>
                {months.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Anio
              <input value={lookupYear} onChange={(event) => onLookupYearChange(event.target.value)} />
            </label>
          </div>

          {selectedSnapshot && snapshotTotals ? (
            <div className="snapshot-summary">
              <Archive size={18} />
              <div>
                <strong>
                  {selectedSnapshot.month} {selectedSnapshot.year}
                </strong>
                <span>Guardado: {new Date(selectedSnapshot.savedAt).toLocaleString('es-AR')}</span>
              </div>
              <dl>
                <div>
                  <dt>Dia</dt>
                  <dd>{currency.format(snapshotTotals.perDay)}</dd>
                </div>
                <div>
                  <dt>Km</dt>
                  <dd>{currency.format(snapshotTotals.perKm)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="muted-copy">Todavia no hay una tabla guardada para ese mes y anio.</p>
          )}
        </div>

      </section>
    </>
  );
}

function getUpdatedValue(line: CostLine, kind: 'day' | 'km') {
  const sourceValue = kind === 'day' ? line.daySourceValue : line.kmSourceValue;
  const fadeeacIndex = kind === 'day' ? line.dayFadeeacIndex : line.kmFadeeacIndex;

  return sourceValue * (1 + fadeeacIndex / 100);
}

function calculateTotals(lines: CostLine[]): CostTotals {
  return lines.reduce(
    (totals, line) => {
      const dayValue = getUpdatedValue(line, 'day');
      const kmValue = getUpdatedValue(line, 'km');

      return {
        perDay: totals.perDay + (line.allocation.perDay ? dayValue : 0),
        perKm: totals.perKm + (line.allocation.perKm ? kmValue : 0)
      };
    },
    { perDay: 0, perKm: 0 }
  );
}

function getPreviousPeriod(month: string, year: string) {
  const monthIndex = months.indexOf(month);
  const previousDate = new Date(Number(year), monthIndex - 1, 1);

  return {
    month: months[previousDate.getMonth()],
    year: String(previousDate.getFullYear())
  };
}

function calculateComparison(
  currentTotals: CostTotals,
  previousPeriod: { month: string; year: string },
  previousSnapshot?: CostSnapshot
): CostComparison {
  if (!previousSnapshot) {
    return {
      previousLabel: `${previousPeriod.month} ${previousPeriod.year}`
    };
  }

  const previousTotals = calculateTotals(previousSnapshot.lines);

  return {
    previousLabel: `${previousSnapshot.month} ${previousSnapshot.year}`,
    perDayPercent: getPercentChange(currentTotals.perDay, previousTotals.perDay),
    perKmPercent: getPercentChange(currentTotals.perKm, previousTotals.perKm)
  };
}

function mapSnapshotFromRows(structure: CostStructureRow, items: CostItemRow[]): CostSnapshot {
  const lines = items
    .map((item) => {
      const legacySourceValue = toNumber(item.source_value);
      const legacyFadeeacIndex = toNumber(item.fadeeac_index);
      const category = Array.isArray(item.cost_categories) ? item.cost_categories[0] : item.cost_categories;

      return {
        id: item.category_id,
        name: category?.name ?? item.category_id,
        daySourceValue: item.day_source_value === null ? (item.applies_per_day ? legacySourceValue : 0) : toNumber(item.day_source_value),
        dayFadeeacIndex: item.day_fadeeac_index === null ? (item.applies_per_day ? legacyFadeeacIndex : 0) : toNumber(item.day_fadeeac_index),
        kmSourceValue: item.km_source_value === null ? (item.applies_per_km ? legacySourceValue : 0) : toNumber(item.km_source_value),
        kmFadeeacIndex: item.km_fadeeac_index === null ? (item.applies_per_km ? legacyFadeeacIndex : 0) : toNumber(item.km_fadeeac_index),
        allocation: {
          perDay: item.applies_per_day,
          perKm: item.applies_per_km
        },
        sortOrder: item.sort_order ?? category?.sort_order ?? 0
      };
    })
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map(({ sortOrder: _sortOrder, ...line }) => line);

  return {
    id: structure.id,
    month: months[structure.month - 1],
    year: String(structure.year),
    savedAt: structure.saved_at,
    lines
  };
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function getPercentChange(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    return undefined;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

function formatPercentChange(value?: number) {
  if (value === undefined) {
    return 'Sin dato';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export default App;

