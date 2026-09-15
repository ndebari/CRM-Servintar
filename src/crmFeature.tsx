import { useState } from 'react';
import {
  Building2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Plus,
  Save,
  SquarePen,
  Trash2,
  Truck,
  Users
} from 'lucide-react';

export type ContactInfo = {
  fullName: string;
  role: string;
  email: string;
  phone: string;
};

export type Client = {
  id: string;
  businessName: string;
  alias: string;
  cuit: string;
  type: string;
  commercialContact: ContactInfo;
  operationalContact: ContactInfo;
  purchasingContact: ContactInfo;
};

export type QuoteStatus = 'Borrador' | 'Pendiente de envio' | 'Enviada' | 'Aprobada' | 'Rechazada';
export type TransportKind = 'expo' | 'impo' | 'otro';

export type CostTotals = {
  perDay: number;
  perKm: number;
};

export type QuoteAdditionalSelection = {
  id: string;
  name: string;
  amount: number;
  discountPercent: number;
  previousAmount?: number;
  confirmedDifferentAmount: boolean;
};

export type TransportQuoteDraft = {
  clientId: string;
  requestDate: string;
  quoteDate: string;
  serviceName: string;
  transportKind: TransportKind;
  base: string;
  origin: string;
  emptyPickup: string;
  consolidationDestination: string;
  deliveryPort: string;
  fullPickupPort: string;
  deconsolidationDestination: string;
  emptyReturnYard: string;
  destination: string;
  isRoundTrip: boolean;
  distanceKm: number;
  requiredDays: number;
  state: QuoteStatus;
  requiredAction: string;
  additionals: QuoteAdditionalSelection[];
};

export type PreparedQuote = {
  id: string;
  clientId: string;
  requestDate: string;
  quoteDate: string;
  summary: string;
  state: QuoteStatus;
  requiredAction: string;
  amount: number;
  text: string;
};

const emptyContact: ContactInfo = {
  fullName: '',
  role: '',
  email: '',
  phone: ''
};

export const initialClients: Client[] = [
  {
    id: 'cliente-servintar-demo',
    businessName: 'Cliente Demo SA',
    alias: 'Demo',
    cuit: '30-00000000-0',
    type: 'Carga general',
    commercialContact: { fullName: 'Juan Perez', role: 'Comercial', email: 'comercial@demo.com', phone: '+54 11 0000-0000' },
    operationalContact: { fullName: 'Maria Gomez', role: 'Operaciones', email: 'operaciones@demo.com', phone: '+54 11 0000-0001' },
    purchasingContact: { fullName: 'Laura Ruiz', role: 'Compras', email: 'compras@demo.com', phone: '+54 11 0000-0002' }
  }
];

export const initialClientTypes = ['Carga general', 'Importador', 'Exportador', 'Forwarder'];
export const initialQuoteStatuses: QuoteStatus[] = ['Borrador', 'Pendiente de envio', 'Enviada', 'Aprobada', 'Rechazada'];
export const initialRequiredActions = ['Enviar al cliente', 'Esperar aprobacion', 'Revisar tarifa', 'Solicitar datos faltantes'];
export const initialAdditionals = ['Devolucion de vacio dia siguiente', 'Demora en la carga', 'Demora en la descarga', 'Pernocte', 'Inhabil'];

export function createQuoteDraft(clientId: string): TransportQuoteDraft {
  const todayIso = new Date().toISOString().slice(0, 10);

  return {
    clientId,
    requestDate: todayIso,
    quoteDate: todayIso,
    serviceName: 'Transporte terrestre',
    transportKind: 'expo',
    base: 'Base Buenos Aires',
    origin: '',
    emptyPickup: '',
    consolidationDestination: '',
    deliveryPort: '',
    fullPickupPort: '',
    deconsolidationDestination: '',
    emptyReturnYard: '',
    destination: '',
    isRoundTrip: false,
    distanceKm: 0,
    requiredDays: 1,
    state: 'Borrador',
    requiredAction: 'Enviar al cliente',
    additionals: []
  };
}

export function createEmptyClient(type: string): Client {
  return {
    id: `cliente-${Date.now()}`,
    businessName: '',
    alias: '',
    cuit: '',
    type,
    commercialContact: { ...emptyContact },
    operationalContact: { ...emptyContact },
    purchasingContact: { ...emptyContact }
  };
}

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});

export function calculateRequiredDays(distanceKm: number) {
  return Math.max(1, Math.ceil(distanceKm / 800));
}

export function buildPreparedQuote(draft: TransportQuoteDraft, clients: Client[], totals: CostTotals): PreparedQuote {
  const client = clients.find((item) => item.id === draft.clientId);
  const routeKm = draft.isRoundTrip ? draft.distanceKm * 2 : draft.distanceKm;
  const baseAmount = totals.perKm * routeKm + totals.perDay * draft.requiredDays;
  const additionalsAmount = draft.additionals.reduce(
    (total, item) => total + item.amount * (1 - item.discountPercent / 100),
    0
  );
  const totalAmount = baseAmount + additionalsAmount;
  const additionalsText =
    draft.additionals.length === 0
      ? 'No se incluyen adicionales.'
      : draft.additionals
          .map((item) => {
            const netAmount = item.amount * (1 - item.discountPercent / 100);
            const discountText = item.discountPercent > 0 ? ` con bonificacion del ${item.discountPercent}%` : '';
            return `- ${item.name}: ${currency.format(netAmount)}${discountText}`;
          })
          .join('\n');

  return {
    id: `cotizacion-${Date.now()}`,
    clientId: draft.clientId,
    requestDate: draft.requestDate,
    quoteDate: draft.quoteDate,
    summary: `${draft.serviceName} ${draft.transportKind.toUpperCase()}`,
    state: 'Pendiente de envio',
    requiredAction: 'Enviar al cliente',
    amount: totalAmount,
    text: [
      `Estimados ${client?.alias ?? client?.businessName ?? 'cliente'},`,
      '',
      `De acuerdo con lo solicitado, enviamos cotizacion por ${draft.serviceName}.`,
      `Operacion: ${draft.transportKind.toUpperCase()} - ${draft.isRoundTrip ? 'roundtrip' : 'solo ida'}.`,
      `Recorrido: ${getRouteDescription(draft)}.`,
      `Kilometros considerados: ${routeKm.toLocaleString('es-AR')} km.`,
      `Dias operativos considerados: ${draft.requiredDays}.`,
      '',
      `Transporte base: ${currency.format(baseAmount)}`,
      'Adicionales:',
      additionalsText,
      '',
      `Total cotizado: ${currency.format(totalAmount)}`,
      '',
      'La presente cotizacion queda sujeta a disponibilidad operativa, validacion documental y condiciones finales del servicio.',
      'Quedamos atentos a sus comentarios.'
    ].join('\n')
  };
}

function getRouteDescription(draft: TransportQuoteDraft) {
  if (draft.transportKind === 'expo') {
    return `${draft.base} / retiro vacio ${draft.emptyPickup || 'sin definir'} / consolidado ${draft.consolidationDestination || 'sin definir'} / puerto ${draft.deliveryPort || 'sin definir'}`;
  }

  if (draft.transportKind === 'impo') {
    return `${draft.base} / puerto retiro full ${draft.fullPickupPort || 'sin definir'} / desconsolidado ${draft.deconsolidationDestination || 'sin definir'} / devolucion vacio ${draft.emptyReturnYard || 'sin definir'}`;
  }

  return `${draft.origin || 'origen sin definir'} a ${draft.destination || 'destino sin definir'}`;
}

function findPreviousAdditionalAmount(quotes: PreparedQuote[], clientId: string, additionalName: string) {
  const previousQuote = quotes.find((quoteItem) => quoteItem.clientId === clientId && quoteItem.text.includes(additionalName));

  if (!previousQuote) {
    return undefined;
  }

  const escapedName = additionalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = previousQuote.text.match(new RegExp(`${escapedName}: \\\\$\\s?([\\d\\.]+)`, 'i'));

  return match ? Number(match[1].replace(/\./g, '')) : undefined;
}

export function CotizadorHome({
  additionalCatalog,
  clients,
  draft,
  previousQuotes,
  onDraftChange,
  onOpenClients,
  onOpenCosts,
  onPrepareQuote,
  totals
}: {
  additionalCatalog: string[];
  clients: Client[];
  draft: TransportQuoteDraft;
  previousQuotes: PreparedQuote[];
  onDraftChange: (draft: TransportQuoteDraft) => void;
  onOpenClients: () => void;
  onOpenCosts: () => void;
  onPrepareQuote: () => void;
  totals: CostTotals;
}) {
  const selectedClient = clients.find((client) => client.id === draft.clientId);
  const routeKm = draft.isRoundTrip ? draft.distanceKm * 2 : draft.distanceKm;
  const baseAmount = totals.perKm * routeKm + totals.perDay * draft.requiredDays;
  const additionalsAmount = draft.additionals.reduce(
    (total, item) => total + item.amount * (1 - item.discountPercent / 100),
    0
  );
  const quoteTotal = baseAmount + additionalsAmount;

  const updateDraft = <K extends keyof TransportQuoteDraft>(field: K, value: TransportQuoteDraft[K]) => {
    onDraftChange({ ...draft, [field]: value });
  };

  const addAdditional = (name: string) => {
    if (!name || draft.additionals.some((item) => item.name === name)) {
      return;
    }

    const previousAmount = findPreviousAdditionalAmount(previousQuotes, draft.clientId, name);
    updateDraft('additionals', [
      ...draft.additionals,
      {
        id: `adicional-${Date.now()}`,
        name,
        amount: previousAmount ?? 0,
        discountPercent: 0,
        previousAmount,
        confirmedDifferentAmount: previousAmount === undefined
      }
    ]);
  };

  const updateAdditional = (id: string, field: 'amount' | 'discountPercent' | 'confirmedDifferentAmount', value: number | boolean) => {
    updateDraft(
      'additionals',
      draft.additionals.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextItem = { ...item, [field]: value };

        if (field === 'amount' && item.previousAmount !== undefined && Number(value) !== item.previousAmount) {
          nextItem.confirmedDifferentAmount = false;
        }

        return nextItem;
      })
    );
  };

  const canPrepare =
    Boolean(draft.clientId) &&
    draft.distanceKm > 0 &&
    draft.requiredDays > 0 &&
    draft.additionals.every(
      (item) => item.previousAmount === undefined || item.previousAmount === item.amount || item.confirmedDifferentAmount
    );

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Cotizador</p>
          <h1>Cotizador</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={onOpenClients} type="button">
            <Users size={17} />
            Clientes
          </button>
          <button className="ghost-button" onClick={onOpenCosts} type="button">
            <FileSpreadsheet size={17} />
            Costos
          </button>
          <button className="primary-button" disabled={!canPrepare} onClick={onPrepareQuote} type="button">
            <FileText size={18} />
            Preparar
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumen de cotizacion">
        <Metric label="Cliente" value={selectedClient?.alias || 'Sin cliente'} hint={selectedClient?.businessName || 'Crear o seleccionar cliente'} />
        <Metric label="Kilometros" value={`${routeKm.toLocaleString('es-AR')} km`} hint={draft.isRoundTrip ? 'Roundtrip' : 'Solo ida'} />
        <Metric label="Dias" value={`${draft.requiredDays}`} hint="800 km cada 24 horas" />
        <Metric label="Transporte" value={currency.format(baseAmount)} hint="Costo km + costo dia" />
        <Metric label="Total" value={currency.format(quoteTotal)} hint="Incluye adicionales netos" />
      </section>

      <section className="content-grid quote-builder-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Servicio base</p>
              <h2>Transporte terrestre</h2>
            </div>
            <Truck size={20} />
          </div>

          <div className="form-grid">
            <label>
              Cliente
              <select value={draft.clientId} onChange={(event) => updateDraft('clientId', event.target.value)}>
                <option value="">Seleccionar cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.alias} - {client.businessName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha solicitud
              <input type="date" value={draft.requestDate} onChange={(event) => updateDraft('requestDate', event.target.value)} />
            </label>
            <label>
              Fecha cotizacion
              <input type="date" value={draft.quoteDate} onChange={(event) => updateDraft('quoteDate', event.target.value)} />
            </label>
            <label>
              Tipo transporte
              <select value={draft.transportKind} onChange={(event) => updateDraft('transportKind', event.target.value as TransportKind)}>
                <option value="expo">Expo</option>
                <option value="impo">Impo</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label>
              Base
              <select value={draft.base} onChange={(event) => updateDraft('base', event.target.value)}>
                <option>Base Buenos Aires</option>
                <option>Base Zarate</option>
              </select>
            </label>
            <label className="check-inline">
              <input checked={draft.isRoundTrip} type="checkbox" onChange={(event) => updateDraft('isRoundTrip', event.target.checked)} />
              Roundtrip
            </label>
          </div>

          {draft.transportKind === 'expo' && (
            <div className="form-grid route-grid">
              <AddressField label="Retiro de vacio" value={draft.emptyPickup} onChange={(value) => updateDraft('emptyPickup', value)} />
              <AddressField label="Consolidado" value={draft.consolidationDestination} onChange={(value) => updateDraft('consolidationDestination', value)} />
              <AddressField label="Puerto de entrega" value={draft.deliveryPort} onChange={(value) => updateDraft('deliveryPort', value)} />
            </div>
          )}

          {draft.transportKind === 'impo' && (
            <div className="form-grid route-grid">
              <AddressField label="Puerto retiro full" value={draft.fullPickupPort} onChange={(value) => updateDraft('fullPickupPort', value)} />
              <AddressField label="Desconsolidado" value={draft.deconsolidationDestination} onChange={(value) => updateDraft('deconsolidationDestination', value)} />
              <AddressField label="Plazoleta devolucion vacio" value={draft.emptyReturnYard} onChange={(value) => updateDraft('emptyReturnYard', value)} />
            </div>
          )}

          {draft.transportKind === 'otro' && (
            <div className="form-grid route-grid">
              <AddressField label="Origen" value={draft.origin} onChange={(value) => updateDraft('origin', value)} />
              <AddressField label="Destino" value={draft.destination} onChange={(value) => updateDraft('destination', value)} />
            </div>
          )}

          <div className="form-grid">
            <label>
              Km solo ida
              <input
                min="0"
                type="number"
                value={draft.distanceKm}
                onChange={(event) => {
                  const distanceKm = Number(event.target.value);
                  onDraftChange({
                    ...draft,
                    distanceKm,
                    requiredDays: calculateRequiredDays(draft.isRoundTrip ? distanceKm * 2 : distanceKm)
                  });
                }}
              />
            </label>
            <label>
              Dias calculados
              <input min="1" type="number" value={draft.requiredDays} onChange={(event) => updateDraft('requiredDays', Number(event.target.value))} />
            </label>
            <label>
              Estado
              <select value={draft.state} onChange={(event) => updateDraft('state', event.target.value as QuoteStatus)}>
                {initialQuoteStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Accion requerida
              <select value={draft.requiredAction} onChange={(event) => updateDraft('requiredAction', event.target.value)}>
                {initialRequiredActions.map((action) => (
                  <option key={action}>{action}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Adicionales</p>
              <h2>Bonificaciones y antecedentes</h2>
            </div>
            <Plus size={20} />
          </div>

          <div className="period-controls add-control">
            <label>
              Agregar adicional
              <select defaultValue="" onChange={(event) => addAdditional(event.target.value)}>
                <option value="">Seleccionar</option>
                {additionalCatalog.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="additional-list">
            {draft.additionals.length === 0 ? (
              <p className="muted-copy">Todavia no hay adicionales cargados.</p>
            ) : (
              draft.additionals.map((item) => {
                const hasDifferentPrevious = item.previousAmount !== undefined && item.previousAmount !== item.amount && !item.confirmedDifferentAmount;

                return (
                  <div className={`additional-row ${hasDifferentPrevious ? 'needs-confirmation' : ''}`} key={item.id}>
                    <strong>{item.name}</strong>
                    <label>
                      Importe
                      <input type="number" value={item.amount} onChange={(event) => updateAdditional(item.id, 'amount', Number(event.target.value))} />
                    </label>
                    <label>
                      Bonif. %
                      <input
                        max="100"
                        min="0"
                        type="number"
                        value={item.discountPercent}
                        onChange={(event) => updateAdditional(item.id, 'discountPercent', Number(event.target.value))}
                      />
                    </label>
                    {item.previousAmount !== undefined && <span>Anterior: {currency.format(item.previousAmount)}</span>}
                    {hasDifferentPrevious && (
                      <label className="check-inline warning-check">
                        <input
                          checked={item.confirmedDifferentAmount}
                          type="checkbox"
                          onChange={(event) => updateAdditional(item.id, 'confirmedDifferentAmount', event.target.checked)}
                        />
                        Confirmar diferencia
                      </label>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export function ClientsModule({
  clients,
  clientTypes,
  onClientTypesChange,
  onDeleteClient,
  onSaveClient
}: {
  clients: Client[];
  clientTypes: string[];
  onClientTypesChange: (types: string[]) => void;
  onDeleteClient: (id: string) => void;
  onSaveClient: (client: Client) => void;
}) {
  const [editingClient, setEditingClient] = useState<Client>(createEmptyClient(clientTypes[0] ?? ''));
  const [newType, setNewType] = useState('');

  const updateContact = (key: 'commercialContact' | 'operationalContact' | 'purchasingContact', field: keyof ContactInfo, value: string) => {
    setEditingClient((currentClient) => ({
      ...currentClient,
      [key]: {
        ...currentClient[key],
        [field]: value
      }
    }));
  };

  const saveEditingClient = () => {
    onSaveClient(editingClient);
    setEditingClient(createEmptyClient(clientTypes[0] ?? ''));
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Modulo</p>
          <h1>Clientes</h1>
        </div>
        <button className="primary-button" onClick={() => setEditingClient(createEmptyClient(clientTypes[0] ?? ''))} type="button">
          <Building2 size={18} />
          Alta de cliente
        </button>
      </header>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Ficha</p>
              <h2>Datos del cliente</h2>
            </div>
            <button className="primary-button" onClick={saveEditingClient} type="button">
              <Save size={18} />
              Guardar cliente
            </button>
          </div>

          <div className="form-grid">
            <label>
              Razon Social
              <input value={editingClient.businessName} onChange={(event) => setEditingClient({ ...editingClient, businessName: event.target.value })} />
            </label>
            <label>
              Alias
              <input value={editingClient.alias} onChange={(event) => setEditingClient({ ...editingClient, alias: event.target.value })} />
            </label>
            <label>
              CUIT
              <input value={editingClient.cuit} onChange={(event) => setEditingClient({ ...editingClient, cuit: event.target.value })} />
            </label>
            <label>
              Tipo
              <select value={editingClient.type} onChange={(event) => setEditingClient({ ...editingClient, type: event.target.value })}>
                {clientTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="contact-grid">
            <ContactEditor title="Contacto Comercial" contact={editingClient.commercialContact} onChange={(field, value) => updateContact('commercialContact', field, value)} />
            <ContactEditor title="Contacto Operativo" contact={editingClient.operationalContact} onChange={(field, value) => updateContact('operationalContact', field, value)} />
            <ContactEditor title="Contacto Compras" contact={editingClient.purchasingContact} onChange={(field, value) => updateContact('purchasingContact', field, value)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ABM</p>
              <h2>Tipos de clientes</h2>
            </div>
          </div>
          <div className="period-controls add-control">
            <input placeholder="Nuevo tipo" value={newType} onChange={(event) => setNewType(event.target.value)} />
            <button
              className="ghost-button"
              onClick={() => {
                if (newType.trim()) {
                  onClientTypesChange([...clientTypes, newType.trim()]);
                  setNewType('');
                }
              }}
              type="button"
            >
              <Plus size={17} />
              Agregar
            </button>
          </div>
          <div className="tag-list">
            {clientTypes.map((type) => (
              <button className="tag-pill" key={type} onClick={() => onClientTypesChange(clientTypes.filter((item) => item !== type))} type="button">
                {type}
                <Trash2 size={14} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Listado</p>
            <h2>Clientes cargados</h2>
          </div>
        </div>
        <div className="entity-list">
          {clients.map((client) => (
            <div className="entity-row" key={client.id}>
              <div>
                <strong>{client.businessName}</strong>
                <span>{client.alias} · {client.cuit} · {client.type}</span>
              </div>
              <button className="ghost-button" onClick={() => setEditingClient(client)} type="button">
                <SquarePen size={17} />
                Editar
              </button>
              <button className="icon-button danger-button" onClick={() => onDeleteClient(client.id)} type="button" aria-label={`Eliminar ${client.alias}`}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function QuotesModule({
  clients,
  quotes,
  statuses,
  requiredActions,
  onStatusesChange,
  onRequiredActionsChange
}: {
  clients: Client[];
  quotes: PreparedQuote[];
  statuses: QuoteStatus[];
  requiredActions: string[];
  onStatusesChange: (statuses: QuoteStatus[]) => void;
  onRequiredActionsChange: (actions: string[]) => void;
}) {
  const [clientFilter, setClientFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newAction, setNewAction] = useState('');

  const filteredQuotes = quotes.filter((quoteItem) => {
    return (
      (!clientFilter || quoteItem.clientId === clientFilter) &&
      (!dateFilter || quoteItem.quoteDate === dateFilter || quoteItem.requestDate === dateFilter) &&
      (!statusFilter || quoteItem.state === statusFilter) &&
      (!actionFilter || quoteItem.requiredAction === actionFilter)
    );
  });

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Modulo</p>
          <h1>Cotizaciones</h1>
        </div>
        <ClipboardList size={24} />
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Filtros</p>
            <h2>Buscar cotizaciones</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Cliente
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="">Todos</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.alias}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Accion requerida
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="">Todas</option>
              {requiredActions.map((action) => (
                <option key={action}>{action}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ABM</p>
              <h2>Estados y acciones</h2>
            </div>
          </div>
          <AbmList title="Estados" values={statuses} newValue={newStatus} onNewValueChange={setNewStatus} onValuesChange={(values) => onStatusesChange(values as QuoteStatus[])} />
          <AbmList title="Acciones requeridas" values={requiredActions} newValue={newAction} onNewValueChange={setNewAction} onValuesChange={onRequiredActionsChange} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Listado</p>
              <h2>Cotizaciones guardadas</h2>
            </div>
          </div>
          <div className="entity-list">
            {filteredQuotes.length === 0 ? (
              <p className="muted-copy">Todavia no hay cotizaciones para esos filtros.</p>
            ) : (
              filteredQuotes.map((quoteItem) => {
                const client = clients.find((item) => item.id === quoteItem.clientId);
                return (
                  <details className="quote-detail" key={quoteItem.id}>
                    <summary>
                      <strong>{client?.alias ?? 'Cliente'}</strong>
                      <span>{quoteItem.quoteDate} · {quoteItem.state} · {currency.format(quoteItem.amount)}</span>
                    </summary>
                    <pre>{quoteItem.text}</pre>
                  </details>
                );
              })
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ContactEditor({
  title,
  contact,
  onChange
}: {
  title: string;
  contact: ContactInfo;
  onChange: (field: keyof ContactInfo, value: string) => void;
}) {
  return (
    <div className="contact-card">
      <h3>{title}</h3>
      <label>
        Apellido y nombre
        <input value={contact.fullName} onChange={(event) => onChange('fullName', event.target.value)} />
      </label>
      <label>
        Cargo
        <input value={contact.role} onChange={(event) => onChange('role', event.target.value)} />
      </label>
      <label>
        Mail
        <input type="email" value={contact.email} onChange={(event) => onChange('email', event.target.value)} />
      </label>
      <label>
        Telefono
        <input value={contact.phone} onChange={(event) => onChange('phone', event.target.value)} />
      </label>
    </div>
  );
}

function AddressField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input placeholder="Direccion, ciudad o puerto" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AbmList({
  title,
  values,
  newValue,
  onNewValueChange,
  onValuesChange
}: {
  title: string;
  values: string[];
  newValue: string;
  onNewValueChange: (value: string) => void;
  onValuesChange: (values: string[]) => void;
}) {
  return (
    <div className="abm-block">
      <h3>{title}</h3>
      <div className="period-controls add-control">
        <input placeholder={`Nuevo ${title.toLowerCase()}`} value={newValue} onChange={(event) => onNewValueChange(event.target.value)} />
        <button
          className="ghost-button"
          onClick={() => {
            if (newValue.trim()) {
              onValuesChange([...values, newValue.trim()]);
              onNewValueChange('');
            }
          }}
          type="button"
        >
          <Plus size={17} />
          Agregar
        </button>
      </div>
      <div className="tag-list">
        {values.map((value) => (
          <button className="tag-pill" key={value} onClick={() => onValuesChange(values.filter((item) => item !== value))} type="button">
            {value}
            <Trash2 size={14} />
          </button>
        ))}
      </div>
    </div>
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
