import { SuppliersModule } from './SuppliersModule';
import { SessionControls } from './SessionControls';
import { ImportLocalData } from './ImportLocalData';
import { quoteNumber } from './quoteLifecycle';
import { QuotesModule } from './QuotesModule';
import { readDatabase, storeQuote, changeQuote, storeClient, removeClient, saveRemoteTypes, saveRemoteAdditionals, crmRpc } from './quoteDatabase';
import { AbmModule } from './AbmModule';
import { useEffect, useMemo, useState, useRef } from 'react';
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
  getQuoteStageErrors,
  ClientsModule,
  CotizadorHome,
  createQuoteDraft,
  type AdditionalDefinition,
  type Client,
  type PreparedQuote,
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
  const [view, setView] = useState<'cotizador' | 'clientes' | 'cotizaciones' | 'costos' | 'abm' | 'precios' | 'proveedores' | 'fleteros'>('cotizador');
  const [month] = useState(months[today.getMonth()]);
  const [year] = useState(String(today.getFullYear()));
  const [lookupMonth, setLookupMonth] = useState(months[today.getMonth()]);
  const [lookupYear, setLookupYear] = useState(String(today.getFullYear()));
  const [costLines, setCostLines] = useState<CostLine[]>(initialCostLines);
  const [snapshots, setSnapshots] = useState<CostSnapshot[]>([]);
  const [isCostEditing, setIsCostEditing] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Sin guardar en esta sesion');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [additionalCatalog, setAdditionalCatalog] = useState<AdditionalDefinition[]>([]);
  const [additionalStatus, setAdditionalStatus] = useState('');
  const saveClientTypes = async (types:string[],rename?:{from:string;to:string}) => {
    try {await saveRemoteTypes(types,clientTypes,rename);await refreshDatabase();return true;}
    catch(error) {setDatabaseError(error instanceof Error?error.message:'No se pudo guardar el catálogo.');return false;}
  };
  const saveAdditionalCatalog = async (items:AdditionalDefinition[]) => {
    try {await saveRemoteAdditionals(items,additionalCatalog);await refreshDatabase();setAdditionalStatus('Catálogo guardado en Supabase.');return true;}
    catch(error) {setAdditionalStatus(error instanceof Error?error.message:'No se pudo guardar el catálogo.');return false;}
  };
  const pendingSave = useRef<{key:string;quote:PreparedQuote} | null>(null);
  const [quotes, setQuotes] = useState<PreparedQuote[]>([]);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState('');
  const [revisionParent, setRevisionParent] = useState<PreparedQuote | null>(null);
  const [quoteFocus, setQuoteFocus] = useState('');
  const [quoteDraft, setQuoteDraft] = useState<TransportQuoteDraft>(() => createQuoteDraft(''));
  const refreshDatabase = async () => { const data=await readDatabase();setQuotes(data.quotes);setClients(data.clients);setClientTypes(data.clientTypes);setAdditionalCatalog(data.additionals);setDatabaseError('');setDatabaseReady(true); };
  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshDatabase();setDatabaseReady(true);
      } catch {setDatabaseError('No se pudo conectar a Supabase. No se guardarán cambios hasta recuperar la conexión.');}
    };
    void initialize();
    const sync=()=>{void refreshDatabase().catch(()=>setDatabaseError('No se pudo actualizar la base de datos.'));};
    window.addEventListener('focus',sync);
    return ()=>window.removeEventListener('focus',sync);
  }, []);

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

  const saveClient = async (client: Client) => {
    if(!databaseReady) throw new Error('La base de datos todavía no está disponible.');
    const previous=clients.find(c=>c.id===client.id);
    await storeClient({...client,createdAt:previous?.createdAt || new Date().toISOString(),active:client.active!==false});
    await refreshDatabase();
    setQuoteDraft(current=>({...current,clientId:current.clientId || client.id}));
  };
  const deleteClient = async (id: string) => {
    await removeClient(id);await refreshDatabase();
    setQuoteDraft(current=>current.clientId===id?{...current,clientId:'',contactKey:undefined}:current);
  };
  const prepareQuote = async () => {
    if(!databaseReady) return 'La base de datos todavía no está disponible.';
    const error=getQuoteStageErrors(quoteDraft,clients).find(Boolean);if(error)return error;
    if(revisionParent && quoteDraft.clientId!==revisionParent.clientId) return 'La recotización debe conservar el cliente original.';
    const saveKey=JSON.stringify({quoteDraft,parent:revisionParent?.id,totals});
    if(!pendingSave.current || pendingSave.current.key!==saveKey)pendingSave.current={key:saveKey,quote:buildPreparedQuote(quoteDraft,clients,totals)};
    const saved=await storeQuote(pendingSave.current.quote,revisionParent?.id);
    await refreshDatabase();setQuoteFocus(saved.id);setRevisionParent(null);
    setQuoteDraft(createQuoteDraft(quoteDraft.clientId));pendingSave.current=null;setView('cotizaciones');
    return undefined;
  };
  const updateQuote = async (id:string, action:'send'|'approve', contactKey?:string) => {
    await changeQuote(id,action,contactKey);await refreshDatabase();
  };
  const requote = (quote:PreparedQuote) => {
    if(!quote.draft)return;
    const today=new Date();const date=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
    const draft=structuredClone(quote.draft);
    if(!clients.some(c=>c.id===quote.clientId) && quote.clientSnapshot) setClients(current=>[...current,quote.clientSnapshot!]);
    setQuoteDraft({...draft,clientId:quote.clientId,quoteDate:date,state:'Pendiente de envio',requiredAction:'Enviar al cliente'});
    setRevisionParent(quote);setView('cotizador');
  };

  const saveMonthlySnapshot = async () => {
    try {
      await crmRpc('crm_save_costs',{p_month:months.indexOf(month)+1,p_year:Number(year),p_lines:costLines});
      await loadMonthlyCostStructures();setLookupMonth(month);setLookupYear(year);setIsCostEditing(false);setSaveStatus('Guardado en Supabase correctamente.');
    } catch(error) {setSaveStatus(error instanceof Error?error.message:'No se pudo guardar en Supabase.');}
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
          <button className={`nav-item ${view === 'cotizaciones' ? 'active' : ''}`} onClick={() => {setQuoteFocus('');setView('cotizaciones');}} aria-current={view === 'cotizaciones' ? 'page' : undefined} type="button">
            <ClipboardList size={18} />
            Cotizaciones
          </button>
          <button className={`nav-item ${view === 'precios' ? 'active' : ''}`} onClick={() => {setQuoteFocus('');setView('precios');}} type="button"><ClipboardList size={18} />Lista de precios</button>
          <button className={`nav-item ${view === 'costos' ? 'active' : ''}`} onClick={() => setView('costos')} aria-current={view === 'costos' ? 'page' : undefined} type="button">
            <FileSpreadsheet size={18} />
            Estructura de costos
          </button>
          <button className={`nav-item ${view === 'abm' ? 'active' : ''}`} onClick={() => setView('abm')} aria-current={view === 'abm' ? 'page' : undefined} type="button"><Plus size={18} />ABM</button>
          <button className={`nav-item ${view==='proveedores'?'active':''}`} onClick={()=>setView('proveedores')} type="button"><Users size={18}/>Proveedores</button>
          <button className={`nav-item ${view==='fleteros'?'active':''}`} onClick={()=>setView('fleteros')} type="button"><BadgeDollarSign size={18}/>Precios fleteros</button>
        </nav>
        </div>
        <div className="sidebar-footer">
          <strong>Todo listo para avanzar</strong>
          <span>Clientes, costos y cotizaciones en un solo lugar.</span>
        </div>

      </aside>

      <section className="workspace" key={view}>
        {databaseError && <p role="alert">{databaseError} <button className="ghost-button" onClick={()=>void refreshDatabase().catch(()=>setDatabaseError('No se pudo conectar a Supabase.'))}>Reintentar</button></p>}
        {!databaseReady && !databaseError && <p>Cargando registros…</p>}
        {(view==='cotizaciones' || view==='precios') && <p className="muted-copy">Registros compartidos en Supabase.</p>}
        {view==='cotizador' && revisionParent && <section className="panel"><strong>Recotización {quoteNumber(revisionParent.sequence!, Math.max(0,...quotes.filter(q=>(q.rootId || q.id)===(revisionParent.rootId || revisionParent.id)).map(q=>q.revision || 0))+1)}</strong><p>Origen: {revisionParent.number}. La versión se confirma al guardar.</p><button type="button" className="ghost-button" onClick={()=>{setRevisionParent(null);setQuoteDraft(createQuoteDraft(quoteDraft.clientId));}}>Cancelar recotización</button></section>}
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
        {view === 'abm' && <><ImportLocalData onImported={refreshDatabase} /><AbmModule additionalCatalog={additionalCatalog} onAdditionalsChange={saveAdditionalCatalog} additionalStatus={additionalStatus} clientTypes={clientTypes} clients={clients} onClientTypesChange={saveClientTypes} /></>}
        {(view==='proveedores'||view==='fleteros')&&<SuppliersModule prices={view==='fleteros'}/>}
        {view === 'clientes' && (
          <ClientsModule
            clientTypes={clientTypes}
            clients={clients}
            onSaveClient={saveClient}
            onDeleteClient={deleteClient}
          />
        )}
        {(view === 'cotizaciones' || view === 'precios') && <QuotesModule clients={clients} quotes={quotes} priceList={view==='precios'} focusId={quoteFocus} onChange={updateQuote} onRequote={requote} />}
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
      <SessionControls /></header>

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

