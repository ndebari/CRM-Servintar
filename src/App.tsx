import { useMemo, useState } from 'react';
import {
  Archive,
  BadgeDollarSign,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  History,
  Plus,
  Save,
  Smartphone,
  Truck
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

type CostAllocation = {
  perDay: boolean;
  perKm: boolean;
};

type CostLine = {
  id: string;
  name: string;
  sourceValue: number;
  fadeeacIndex: number;
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

const initialCostLines: CostLine[] = [
  { id: 'combustible', name: 'Combustible', sourceValue: 340000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'lubricantes', name: 'Lubricantes', sourceValue: 52000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'neumaticos', name: 'Neumaticos', sourceValue: 118000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'reparaciones', name: 'Reparaciones', sourceValue: 165000, fadeeacIndex: 0, allocation: { perDay: true, perKm: true } },
  { id: 'material-rodante', name: 'Material Rodante', sourceValue: 260000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'personal', name: 'Personal', sourceValue: 980000, fadeeacIndex: 0, allocation: { perDay: true, perKm: false } },
  { id: 'seguros', name: 'Seguros', sourceValue: 126000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'patentes-tasas', name: 'Patentes y tasas', sourceValue: 76000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } },
  { id: 'costo-financiero', name: 'Costo Financiero', sourceValue: 94000, fadeeacIndex: 0, allocation: { perDay: true, perKm: true } },
  { id: 'gastos-generales', name: 'Gastos Generales', sourceValue: 210000, fadeeacIndex: 0, allocation: { perDay: false, perKm: true } }
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
  const [view, setView] = useState<'cotizador' | 'costos'>('cotizador');
  const [month] = useState(months[today.getMonth()]);
  const [year] = useState(String(today.getFullYear()));
  const [lookupMonth, setLookupMonth] = useState(months[today.getMonth()]);
  const [lookupYear, setLookupYear] = useState(String(today.getFullYear()));
  const [costLines, setCostLines] = useState<CostLine[]>(initialCostLines);
  const [snapshots, setSnapshots] = useState<CostSnapshot[]>([]);
  const [saveStatus, setSaveStatus] = useState('Sin guardar en esta sesion');

  const totals = useMemo(() => calculateTotals(costLines), [costLines]);
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.month === lookupMonth && snapshot.year === lookupYear);
  const currentSnapshot = snapshots.find((snapshot) => snapshot.month === month && snapshot.year === year);

  const updateLine = (id: string, field: 'sourceValue' | 'fadeeacIndex', value: string) => {
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
        sourceValue: 0,
        fadeeacIndex: 0,
        allocation: {
          perDay: false,
          perKm: true
        }
      }
    ]);
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

    if (!supabase) {
      setSaveStatus('Guardado local. Supabase no esta configurado.');
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
      costLines.map((line) => ({
        structure_id: structure.id,
        category_id: line.id,
        source_value: line.sourceValue,
        fadeeac_index: line.fadeeacIndex,
        updated_value: getUpdatedValue(line),
        applies_per_day: line.allocation.perDay,
        applies_per_km: line.allocation.perKm
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
            <span>PWA operativa</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Principal">
          <button className={`nav-item ${view === 'cotizador' ? 'active' : ''}`} onClick={() => setView('cotizador')} type="button">
            <CircleDollarSign size={18} />
            Cotizador
          </button>
          <button className={`nav-item ${view === 'costos' ? 'active' : ''}`} onClick={() => setView('costos')} type="button">
            <FileSpreadsheet size={18} />
            Estructura de costos
          </button>
        </nav>

        <div className="sync-panel">
          <Smartphone size={18} />
          <div>
            <strong>{isSupabaseConfigured ? 'Supabase conectado' : 'Supabase pendiente'}</strong>
            <span>{isSupabaseConfigured ? 'Listo para guardar datos' : 'Configurar variables .env'}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        {view === 'cotizador' ? (
          <CotizadorHome
            currentMonthLabel={`${month} ${year}`}
            isCurrentMonthReady={Boolean(currentSnapshot)}
            onOpenCosts={() => setView('costos')}
            snapshots={snapshots.length}
            totals={totals}
          />
        ) : (
          <CostStructure
            costLines={costLines}
            isCurrentMonthReady={Boolean(currentSnapshot)}
            lookupMonth={lookupMonth}
            lookupYear={lookupYear}
            month={month}
            onAllocationChange={updateAllocation}
            onAddLine={addCostLine}
            onBack={() => setView('cotizador')}
            onLineChange={updateLine}
            onLineNameChange={updateLineName}
            onLookupMonthChange={setLookupMonth}
            onLookupYearChange={setLookupYear}
            onSave={saveMonthlySnapshot}
            selectedSnapshot={selectedSnapshot}
            saveStatus={saveStatus}
            snapshots={snapshots}
            totals={totals}
            year={year}
          />
        )}
      </section>
    </main>
  );
}

function CotizadorHome({
  currentMonthLabel,
  isCurrentMonthReady,
  totals,
  onOpenCosts,
  snapshots
}: {
  currentMonthLabel: string;
  isCurrentMonthReady: boolean;
  totals: CostTotals;
  onOpenCosts: () => void;
  snapshots: number;
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Primera seccion</p>
          <h1>Cotizador</h1>
        </div>
        <button className="primary-button" onClick={onOpenCosts} type="button">
          <FileSpreadsheet size={18} />
          Estructura de costos
        </button>
      </header>

      <section className="metric-grid" aria-label="Resumen de costos">
        <Metric label="Mes vigente" value={currentMonthLabel} hint={isCurrentMonthReady ? 'Habilitado para cotizar' : 'Pendiente de guardar'} />
        <Metric label="Afectado por dia" value={currency.format(totals.perDay)} hint="Base para tarifas diarias" />
        <Metric label="Afectado por km" value={currency.format(totals.perKm)} hint="Base para tarifas por kilometro" />
        <Metric label="Tablas guardadas" value={String(snapshots)} hint="Historico mensual" />
      </section>

      <section className="panel quote-panel">
        <div className="empty-state">
          <Truck size={42} />
          <div>
            <h2>El cotizador tomara sus valores desde la estructura de costos</h2>
            <p>
              Primero definimos los costos fuente, el indice FADEEAC mensual y la afectacion de cada rubro. Despues
              conectamos estos valores a las cotizaciones comerciales.
            </p>
          </div>
          <button className="ghost-button" onClick={onOpenCosts} type="button">
            <FileSpreadsheet size={17} />
            Abrir costos
          </button>
        </div>
      </section>
    </>
  );
}

type CostStructureProps = {
  costLines: CostLine[];
  isCurrentMonthReady: boolean;
  lookupMonth: string;
  lookupYear: string;
  month: string;
  onAllocationChange: (id: string, field: keyof CostAllocation, checked: boolean) => void;
  onAddLine: () => void;
  onBack: () => void;
  onLineChange: (id: string, field: 'sourceValue' | 'fadeeacIndex', value: string) => void;
  onLineNameChange: (id: string, value: string) => void;
  onLookupMonthChange: (month: string) => void;
  onLookupYearChange: (year: string) => void;
  onSave: () => void;
  selectedSnapshot?: CostSnapshot;
  saveStatus: string;
  snapshots: CostSnapshot[];
  totals: CostTotals;
  year: string;
};

function CostStructure({
  costLines,
  isCurrentMonthReady,
  lookupMonth,
  lookupYear,
  month,
  onAllocationChange,
  onAddLine,
  onBack,
  onLineChange,
  onLineNameChange,
  onLookupMonthChange,
  onLookupYearChange,
  onSave,
  selectedSnapshot,
  saveStatus,
  snapshots,
  totals,
  year
}: CostStructureProps) {
  const snapshotTotals = selectedSnapshot ? calculateTotals(selectedSnapshot.lines) : null;

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
          <button className="primary-button" onClick={onSave} type="button">
            <Save size={18} />
            Guardar mes completo
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Totales de estructura">
        <Metric label="Mes vigente" value={`${month} ${year}`} hint={isCurrentMonthReady ? 'Habilitado para cotizar' : 'Pendiente de guardar'} />
        <Metric label="Costo por dia" value={currency.format(totals.perDay)} hint="Items marcados por dia" />
        <Metric label="Costo por km" value={currency.format(totals.perKm)} hint="Items marcados por kilometro" />
        <Metric label="Versiones historicas" value={String(snapshots.length)} hint="Copias mensuales guardadas" />
      </section>

      <section className="panel costs-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Planilla mensual</p>
            <h2>Costos de origen e indice FADEEAC</h2>
          </div>
          <div className="cost-actions">
            <button className="ghost-button" onClick={onAddLine} type="button">
              <Plus size={17} />
              Agregar linea
            </button>
            <div className="current-period">
              <span>Mes vigente</span>
              <strong>{month} {year}</strong>
            </div>
          </div>
        </div>

        <div className="cost-table">
          <div className="cost-row cost-head">
            <span>Rubro</span>
            <span>Costo origen</span>
            <span>Ajuste FADEEAC %</span>
            <span>x dia</span>
            <span>Costo diario</span>
            <span>x km</span>
            <span>Costo km</span>
          </div>
          {costLines.map((line) => {
            const updatedValue = getUpdatedValue(line);
            const dailyValue = line.allocation.perDay ? updatedValue : 0;
            const kmValue = line.allocation.perKm ? updatedValue : 0;

            return (
              <div className="cost-row" key={line.id}>
                <input className="rubric-input" value={line.name} onChange={(event) => onLineNameChange(line.id, event.target.value)} />
                <input
                  min="0"
                  type="number"
                  value={line.sourceValue}
                  onChange={(event) => onLineChange(line.id, 'sourceValue', event.target.value)}
                />
                <input
                  step="0.01"
                  type="number"
                  value={line.fadeeacIndex}
                  onChange={(event) => onLineChange(line.id, 'fadeeacIndex', event.target.value)}
                />
                <label className="check-cell">
                  <input
                    checked={line.allocation.perDay}
                    type="checkbox"
                    onChange={(event) => onAllocationChange(line.id, 'perDay', event.target.checked)}
                  />
                </label>
                <span className={`allocation-value ${line.allocation.perDay ? '' : 'inactive'}`}>
                  {line.allocation.perDay ? currency.format(dailyValue) : 'No aplica'}
                </span>
                <label className="check-cell">
                  <input
                    checked={line.allocation.perKm}
                    type="checkbox"
                    onChange={(event) => onAllocationChange(line.id, 'perKm', event.target.checked)}
                  />
                </label>
                <span className={`allocation-value ${line.allocation.perKm ? '' : 'inactive'}`}>
                  {line.allocation.perKm ? currency.format(kmValue) : 'No aplica'}
                </span>
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

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Guardado</p>
              <h2>Version mensual completa</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <p className="muted-copy">
            Al guardar, se conserva una copia de todos los rubros, sus valores de origen, indices FADEEAC, valores
            actualizados y afectacion por dia o kilometro. Desde ese momento el mes vigente queda habilitado para cotizar.
          </p>
          <p className="save-status">{saveStatus}</p>
        </div>
      </section>
    </>
  );
}

function getUpdatedValue(line: CostLine) {
  return line.sourceValue * (1 + line.fadeeacIndex / 100);
}

function calculateTotals(lines: CostLine[]): CostTotals {
  return lines.reduce(
    (totals, line) => {
      const updatedValue = getUpdatedValue(line);

      return {
        perDay: totals.perDay + (line.allocation.perDay ? updatedValue : 0),
        perKm: totals.perKm + (line.allocation.perKm ? updatedValue : 0)
      };
    },
    { perDay: 0, perKm: 0 }
  );
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
