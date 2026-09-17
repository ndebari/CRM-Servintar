import { useEffect, useRef, useState } from 'react';
import operatorCatalog from '../netlify/lib/toll-operators.json';
import {
  Building2,
  ClipboardList,
  Plus,
  Save,
  SquarePen,
  Trash2,
  Truck,
  Users
} from 'lucide-react';

type GoogleStep = { instructions?: string; distance?: { value: number }; path?: { lat: () => number; lng: () => number }[] };
type GoogleLeg = { steps?: GoogleStep[]; distance?: { value: number } };

declare global {
  interface Window {
    google?: {
      maps?: {
        DirectionsService: new () => {
          route: (
            request: {
              destination: string;
              origin: string;
              travelMode: string;
              provideRouteAlternatives?: boolean;
              avoidHighways?: boolean;
              avoidTolls?: boolean;
              region?: string;
              waypoints?: { location: string; stopover: boolean }[];
            },
            callback: (
              result: {
                routes?: {
                  summary?: string;
                  legs?: GoogleLeg[];
                }[];
              } | null,
              status: string
            ) => void
          ) => void;
        };
        DirectionsStatus?: {
          OK: string;
        };
        TravelMode?: {
          DRIVING: string;
        };
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: {
              fields?: string[];
            }
          ) => {
            addListener: (eventName: 'place_changed', handler: () => void) => { remove: () => void };
            getPlace: () => {
              formatted_address?: string;
              name?: string;
            };
          };
        };
      };
    };
  }
}

let googlePlacesLoader: Promise<void> | null = null;

function loadGooglePlaces() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  if (!apiKey) {
    return Promise.reject(new Error('Missing Google Maps API key'));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (googlePlacesLoader) {
    return googlePlacesLoader;
  }

  googlePlacesLoader = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-places="true"]');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Could not load Google Places')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=es&region=AR`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Places'));
    document.head.appendChild(script);
  });

  return googlePlacesLoader;
}

export const LAVAISSE_BASE = 'Base Lavaisse';
export const LAVAISSE_ADDRESS = 'Benjamín Lavaisse 1401, Ciudad Autónoma de Buenos Aires, Argentina';
export const BERISSO_BASE = 'Base Berisso';
export const BERISSO_ADDRESS = 'TECPLATA, Río de Janeiro Oeste 5071, Berisso, Buenos Aires, Argentina';
const baseName = (base: string) => base === 'Base Buenos Aires' ? LAVAISSE_BASE : base === 'TECPLATA, La Plata, Buenos Aires, Argentina' ? BERISSO_BASE : base;
const routeAddress = (address: string) => baseName(address.trim()) === LAVAISSE_BASE ? LAVAISSE_ADDRESS : baseName(address.trim()) === BERISSO_BASE ? BERISSO_ADDRESS : address.trim();

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
export type TransportKind = 'expo' | 'impo' | 'carreton' | 'distribucion' | 'carga-suelta' | 'otro';
const transportLabels: Record<TransportKind,string> = {expo:'Expo',impo:'Impo',carreton:'Carretón',distribucion:'Distribución','carga-suelta':'Carga suelta',otro:'Otro'};
export const quoteStages = ['Cliente','Descripción del servicio','Cotización','Peajes','Adicionales','Detalle de la cotización'];
type ContactKey = 'commercialContact' | 'operationalContact' | 'purchasingContact';
export function getClientContacts(client?: Client) {
  const entries: {key: ContactKey; label: string}[] = [{key:'commercialContact',label:'Comercial'},{key:'operationalContact',label:'Operativo'},{key:'purchasingContact',label:'Compras'}];
  return entries.flatMap(({key,label}) => client?.[key]?.fullName.trim() ? [{key,label,contact:client[key]}] : []);
}
export type IntermediateStop = { id: string; address: string; afterStop: number; transportKind: TransportKind };

export type CostTotals = {
  perDay: number;
  perKm: number;
};

export type AdditionalDefinition = { id: string; name: string; description: string; kind: 'fixed' | 'percent'; amount?: number };

export function createAdditionalSelection(definition: AdditionalDefinition, previousAmount?: number): QuoteAdditionalSelection {
  return { id: 'catalog:' + definition.id, catalogId: definition.id, name: definition.name,
    description: definition.description, kind: definition.kind, amount: definition.amount ?? 0,
    discountPercent: 0, previousAmount, confirmedDifferentAmount: true };
}

export type QuoteAdditionalSelection = {
  catalogId?: string;
  description?: string;
  kind?: 'fixed' | 'percent';
  id: string;
  name: string;
  amount: number;
  discountPercent: number;
  previousAmount?: number;
  confirmedDifferentAmount: boolean;
};

export type RouteToll = {
  id: string; name: string; locality: string; road: string; province: string;
  amount: number | null; source: 'pending' | 'automatic' | 'official' | 'manual';
  payment?: "" | "tag" | "cash" | "electronic";
  journey?: "outbound" | "return";
  travelSense?: string; legIndex?: number; legOrigin?: string; legDestination?: string;
  operator?: string; period?: string; direction?: string; stationSourceUrl?: string;
  sourceUrl?: string; sourcePage?: string; category?: string; checkedAt?: string; lookupMessage?: string;
};

export type TransportQuoteDraft = {
  clientId: string;
  contactKey?: ContactKey;
  roundingUnit?: number;
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
  intermediateStops?: IntermediateStop[];
  returnFromStop?: number;
  distanceKm: number;
  requiredDays: number;
  utilityPercent: number | "";
  tolls: RouteToll[];
  tollListStatus: "pending" | "detected" | "manual";
  tollRouteKey: string;
  truck: { tractorAxles: number; height: number; weight: number; length: number };
  /** Legacy payment, used only for existing rows without their own selection. */
  tollPayment: "" | "tag" | "cash" | "electronic";
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
  clientName?: string;
  contact?: ContactInfo;
  draft?: TransportQuoteDraft;
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
export const initialAdditionals: AdditionalDefinition[] = ['Devolucion de vacio dia siguiente', 'Demora en la carga', 'Demora en la descarga', 'Pernocte', 'Inhabil'].map((name, index) => ({ id: 'adicional-base-' + index, name, description: '', kind: 'fixed' }));

export function createQuoteDraft(clientId: string): TransportQuoteDraft {
  const todayIso = new Date().toISOString().slice(0, 10);

  return {
    clientId,
    requestDate: todayIso,
    quoteDate: todayIso,
    serviceName: 'Transporte terrestre',
    transportKind: 'expo',
    base: LAVAISSE_BASE,
    origin: '',
    emptyPickup: '',
    consolidationDestination: '',
    deliveryPort: '',
    fullPickupPort: '',
    deconsolidationDestination: '',
    emptyReturnYard: '',
    destination: '',
    isRoundTrip: true,
    distanceKm: 0,
    requiredDays: 1,
    utilityPercent: '',
    roundingUnit: 0,
    tolls: [],
    tollListStatus: "pending",
    tollRouteKey: "",
    truck: { tractorAxles: 3, height: 0, weight: 0, length: 0 },
    tollPayment: "",
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

export function isValidUtility(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100;
}

function calculateTariffFromCost(cost: number, utilityPercent: number | '') {
  if (!isValidUtility(utilityPercent)) throw new Error('Completá la utilidad con un valor entre 0 y menos de 100.');

  return cost / ((100 - utilityPercent) / 100);
}

export function roundQuoteTariff(value: number, unit = 0) {
  if (!Number.isFinite(value) || value < 0 || ![0,1,100,1000].includes(unit)) throw new Error('Revisá el redondeo de la tarifa.');
  return unit === 0 ? value : Math.ceil((value - 1e-8) / unit) * unit;
}

export function getQuoteStageErrors(draft: TransportQuoteDraft, clients: Client[]) {
  const client = clients.find(item => item.id === draft.clientId);
  const contact = getClientContacts(client).some(item => item.key === draft.contactKey);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const stops = getRouteStops(draft);
  const validAdditional = draft.additionals.every(item => Number.isFinite(item.amount) && item.amount >= 0 && Number.isFinite(item.discountPercent) && item.discountPercent >= 0 && item.discountPercent <= 100 && (item.previousAmount === undefined || item.previousAmount === item.amount || item.confirmedDifferentAmount));
  return [
    !client ? 'Seleccioná un cliente.' : !validDate(draft.requestDate) || !validDate(draft.quoteDate) ? 'Completá las fechas de solicitud y cotización.' : !contact ? 'Seleccioná un contacto del cliente. Podés cargarlo en el ABM de Clientes.' : '',
    ![LAVAISSE_BASE,BERISSO_BASE].includes(baseName(draft.base)) ? 'Seleccioná una base de salida.' : stops.some(stop => !stop.trim()) ? 'Completá todas las direcciones y paradas intermedias.' : stops.length > 26 ? 'El recorrido admite hasta 25 tramos.' : '',
    !Number.isFinite(draft.distanceKm) || draft.distanceKm <= 0 ? 'Completá los kilómetros del recorrido.' : !Number.isInteger(draft.requiredDays) || draft.requiredDays < 1 ? 'Completá los días de operación.' : !isValidUtility(draft.utilityPercent) ? 'Completá la utilidad.' : '',
    !summarizeTolls(draft).ready ? 'Completá y confirmá los peajes del recorrido.' : '',
    !validAdditional ? 'Revisá los importes, bonificaciones y diferencias de los adicionales seleccionados.' : '',
    ![0,1,100,1000].includes(draft.roundingUnit ?? 0) ? 'Seleccioná el redondeo de la tarifa.' : ''
  ];
}

export function calculateAdditionalAmount(item: QuoteAdditionalSelection, transportBase: number) {
  if (!Number.isFinite(item.amount) || item.amount < 0 || !Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100) throw new Error('Revisá el valor y la bonificación del adicional.');
  const gross = item.kind === 'percent' ? transportBase * item.amount / 100 : item.amount;
  return Math.round(gross * (1 - item.discountPercent / 100) * 100) / 100;
}

export function buildPreparedQuote(draft: TransportQuoteDraft, clients: Client[], totals: CostTotals): PreparedQuote {
  const client = clients.find((item) => item.id === draft.clientId);
  const baseAmount = totals.perKm * draft.distanceKm + totals.perDay * draft.requiredDays;
  const additionalsAmount = draft.additionals.reduce(
    (total, item) => total + calculateAdditionalAmount(item, baseAmount),
    0
  );
  const tollSummary = summarizeTolls(draft);
  if (!tollSummary.ready) {
    throw new Error("Confirmá los peajes del recorrido actual antes de preparar la cotización.");
  }
  const totalCost = baseAmount + additionalsAmount + tollSummary.total;
  const unroundedAmount = calculateTariffFromCost(totalCost, draft.utilityPercent);
  const totalAmount = roundQuoteTariff(unroundedAmount, draft.roundingUnit);
  const contact = getClientContacts(client).find(item => item.key === draft.contactKey)?.contact;
  const additionalsText =
    draft.additionals.length === 0
      ? 'No se incluyen adicionales.'
      : draft.additionals
          .map((item) => {
            const netAmount = calculateAdditionalAmount(item, baseAmount);
            const discountText = item.discountPercent > 0 ? ` con bonificacion del ${item.discountPercent}%` : '';
            return `- ${item.name}: ${currency.format(netAmount)}${item.kind === "percent" ? ` (${item.amount}% del transporte base)` : ""}${discountText}${item.description ? ` — ${item.description}` : ""}`;
          })
          .join('\n');

  return {
    id: `cotizacion-${Date.now()}`,
    clientId: draft.clientId,
    requestDate: draft.requestDate,
    quoteDate: draft.quoteDate,
    summary: `${draft.serviceName} ${transportLabels[draft.transportKind]}`,
    clientName: client?.alias || client?.businessName,
    contact: contact ? {...contact} : undefined,
    draft: JSON.parse(JSON.stringify(draft)),
    state: 'Pendiente de envio',
    requiredAction: 'Enviar al cliente',
    amount: totalAmount,
    text: [
      `Estimados ${client?.alias ?? client?.businessName ?? 'cliente'},`,
      ...(contact ? [`Contacto: ${contact.fullName}${contact.role ? ' · ' + contact.role : ''}`,`Email: ${contact.email || '—'} · Teléfono: ${contact.phone || '—'}`] : []),
      `Fecha de solicitud: ${draft.requestDate} · Fecha de cotización: ${draft.quoteDate}`,
      '',
      `De acuerdo con lo solicitado, enviamos cotizacion por ${draft.serviceName}.`,
      `Operacion: ${transportLabels[draft.transportKind]} - ${draft.isRoundTrip ? 'roundtrip' : 'solo ida'}.`,
      `Base de salida: ${baseName(draft.base)} · ${routeAddress(draft.base)}`,
      `Recorrido: ${getRouteDescription(draft)}.`,
      ...(activeIntermediateStops(draft).length ? [`Recorrido con paradas: ${getRouteStops(draft).join(' → ')}.`] : []),
      `Kilometros considerados: ${draft.distanceKm.toLocaleString('es-AR')} km.`,
      `Dias operativos considerados: ${draft.requiredDays}.`,
      '',
      `Transporte base: ${currency.format(baseAmount)}`,
      "Peajes · tractor 3 ejes + araña 3 ejes:",
      ...draft.tolls.map((toll, index) => "- " + (toll.journey === "return" ? "Vuelta · " : toll.journey === "outbound" || !draft.isRoundTrip ? "Ida · " : "") + "Paso " + (index + 1) + ": " + toll.name + " — " + toll.locality + (toll.travelSense ? " · " + toll.travelSense : "") + ": " + currency.format(toll.amount!) + (toll.source === "manual" ? " (manual)" : "")),
      "Total peajes: " + currency.format(tollSummary.total),
      'Adicionales:',
      additionalsText,
      '',
      `Costo total: ${currency.format(totalCost)}`,
      `Utilidad aplicada: ${draft.utilityPercent}%`,
      `Fórmula: costo total / (1 − utilidad / 100)`,
      `Tarifa sin redondeo: ${unroundedAmount.toLocaleString('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2})}`,
      `Redondeo: ${draft.roundingUnit ? 'al múltiplo superior de $' + draft.roundingUnit : 'sin redondeo adicional'}`,
      `Total cotizado: ${totalAmount.toLocaleString('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2})}`,
      '',
      'Las tarifas no incluyen Impuestos aplicables.',
      'Seguros de la carga a cargo del dueño de la mercadería con clausula de no repetición a favor del transporte.',
      '',
      'La presente cotizacion queda sujeta a disponibilidad operativa, validacion documental y condiciones finales del servicio.',
      'Quedamos atentos a sus comentarios.'
    ].join('\n')
  };
}

function getRouteDescription(draft: TransportQuoteDraft) {
  if (draft.transportKind === 'expo') {
    return `${baseName(draft.base)} / retiro vacio ${draft.emptyPickup || 'sin definir'} / consolidado ${draft.consolidationDestination || 'sin definir'} / puerto ${draft.deliveryPort || 'sin definir'}`;
  }

  if (draft.transportKind === 'impo') {
    return `${baseName(draft.base)} / puerto retiro full ${draft.fullPickupPort || 'sin definir'} / desconsolidado ${draft.deconsolidationDestination || 'sin definir'} / devolucion vacio ${draft.emptyReturnYard || 'sin definir'}`;
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

function getMainRouteStops(draft: TransportQuoteDraft) {
  const stops =
    draft.transportKind === 'expo'
      ? [draft.base, draft.emptyPickup, draft.consolidationDestination, draft.deliveryPort]
      : draft.transportKind === 'impo'
        ? [draft.base, draft.fullPickupPort, draft.deconsolidationDestination, draft.emptyReturnYard]
        : draft.transportKind === 'otro' ? [draft.origin, draft.destination] : [draft.base, draft.origin, draft.destination];
  const cleanStops = stops.map(routeAddress);

  if (draft.isRoundTrip && cleanStops.length > 1) {
    return [...cleanStops, cleanStops[0]];
  }

  return cleanStops;
}

function activeIntermediateStops(draft: TransportQuoteDraft) {
  const segmentCount = getMainRouteStops(draft).length - 1;
  return (draft.intermediateStops ?? []).filter(stop => stop.transportKind === draft.transportKind && stop.afterStop >= 0 && stop.afterStop < segmentCount);
}

export function getRouteStops(draft: TransportQuoteDraft) {
  const mainStops = getMainRouteStops(draft);
  const intermediate = activeIntermediateStops(draft);
  return mainStops.flatMap((address,index) => [address, ...intermediate.filter(stop => stop.afterStop === index).map(stop => routeAddress(stop.address))]);
}

export function summarizeTolls(draft: TransportQuoteDraft) {
  const current = draft.tollRouteKey === getTruckRouteKey(draft);
  const validAmount = (toll: RouteToll) => toll.amount !== null && Number.isFinite(toll.amount) && toll.amount >= 0;
  const pending = draft.tolls.filter(toll => !validAmount(toll) || !toll.name.trim() || !toll.locality.trim()).length;
  return {
    total: current ? Math.round(draft.tolls.reduce((sum, toll) => sum + (validAmount(toll) ? toll.amount! : 0), 0) * 100) / 100 : 0,
    pending,
    ready: current && draft.tollListStatus !== 'pending' && pending === 0
  };
}


export function getTollGroups(draft: Pick<TransportQuoteDraft, 'tolls' | 'isRoundTrip'>) {
  const rows = draft.tolls.map((toll, index) => ({ toll, index }));
  const groups = [{ id: 'outbound', title: 'Peajes de ida', rows: rows.filter(({ toll }) => toll.journey === 'outbound' || (!toll.journey && !draft.isRoundTrip)) }];
  if (draft.isRoundTrip || rows.some(({ toll }) => toll.journey === 'return')) {
    groups.push({ id: 'return', title: 'Peajes de vuelta', rows: rows.filter(({ toll }) => toll.journey === 'return') });
  }
  const unknown = rows.filter(({ toll }) => !toll.journey && draft.isRoundTrip);
  if (unknown.length) groups.push({ id: 'unknown', title: 'Peajes sin tramo identificado', rows: unknown });
  return groups;
}

export function mergeRouteTolls(incoming: RouteToll[], previous: RouteToll[]) {
  const merged = incoming.map(toll => {
    const old = previous.find(item => item.id === toll.id);
    return old ? { ...toll, ...old, journey: toll.journey ?? old.journey,
      travelSense: toll.travelSense, legIndex: toll.legIndex, legOrigin: toll.legOrigin, legDestination: toll.legDestination } : toll;
  });
  return [...merged, ...previous.filter(toll => toll.id.startsWith('manual:') && !merged.some(item => item.id === toll.id))];
}

export function getTruckRouteKey(draft: TransportQuoteDraft) {
  return JSON.stringify({ policy: 'major-roads-v2-return-pivot', stops: getRouteStops(draft), isRoundTrip: draft.isRoundTrip, returnFromStop: draft.returnFromStop });
}

// Directions exposes instructions, not road classes or truck restrictions.
// Discount only recognized road names; unclassified distance remains conservative.
function roadWeight(step: GoogleStep) {
  const instruction = (step.instructions ?? '').split(/<div\b|\bhacia\b|\ben direcci[oó]n a\b|\btoward\b/i)[0];
  // Instructions often bold the turn direction before the road itself.
  const road = [...instruction.matchAll(/<b>(.*?)<\/b>/gi)].map(match => match[1]).join(' ');
  const name = road.replace(/<[^>]*>/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(autopista|autovia|au\.?\s|acceso norte|acceso oeste|panamericana|gral\.? paz|general paz|rn\s*\d|rp\s*\d|ruta\b)/.test(name)) return 1;
  if (/\b(avenida|av\.?\s)/.test(name)) return 1.3;
  return 2;
}

function routeScore(leg: GoogleLeg) {
  const meters = leg.distance!.value;
  let remaining = meters;
  let score = meters * 2;
  for (const step of leg.steps ?? []) {
    const distance = step.distance?.value;
    if (distance === undefined || !Number.isFinite(distance) || distance < 0) continue;
    const covered = Math.min(distance, remaining);
    score -= covered * (2 - roadWeight(step));
    remaining -= covered;
  }
  return score;
}

export async function calculateGoogleRoute(stops: string[]) {
  if (!window.google?.maps?.DirectionsService) throw new Error('Google Directions is not available');
  if (stops.length < 2 || stops.some(stop => !stop.trim())) throw new Error('Incomplete route stops');
  const service = new window.google.maps.DirectionsService();
  const legs: GoogleLeg[] = [];
  const summaries: string[] = [];
  // Alternatives are unavailable with intermediate waypoints. Request each leg,
  // keeping the user's stop order and calculating the return independently.
  for (let index = 0; index < stops.length - 1; index++) {
    legs.push(await new Promise<GoogleLeg>((resolve, reject) => service.route({
      origin: stops[index], destination: stops[index + 1],
      travelMode: window.google!.maps!.TravelMode?.DRIVING ?? 'DRIVING',
      provideRouteAlternatives: true, avoidHighways: false, avoidTolls: false, region: 'AR'
    }, (result, status) => {
      if (status !== (window.google?.maps?.DirectionsStatus?.OK ?? 'OK')) {
        reject(new Error(`Directions failed with status ${status}`)); return;
      }
      const candidates = (result?.routes ?? []).flatMap(route => route.legs?.length === 1 ? [{leg: route.legs[0], summary: route.summary}] : [])
        .filter(({leg}) => Number.isFinite(leg.distance?.value) && leg.distance!.value >= 0);
      if (!candidates.length) { reject(new Error('Incomplete route distance')); return; }
      const shortest = Math.min(...candidates.map(({leg}) => leg.distance!.value));
      // Bound detours: prefer major roads among alternatives within 10% of the shortest.
      const selected = candidates.filter(({leg}) => leg.distance!.value <= shortest * 1.10)
        .sort((a, b) => routeScore(a.leg) - routeScore(b.leg) || a.leg.distance!.value - b.leg.distance!.value)[0];
      summaries.push(selected.summary || 'Vías no informadas');
      resolve(selected.leg);
    })));
  }
  const legPaths = legs.map(leg => (leg.steps ?? []).flatMap(step => (step.path ?? []).map(point => [point.lat(), point.lng()])));
  // Never join across a missing leg and estimate tolls on an invented connector.
  const completeGeometry = legs.every((leg, index) => legPaths[index].length >= 2 &&
    (leg.steps ?? []).every(step => step.path && step.path.length >= 2) &&
    legPaths[index].every(point => point.every(Number.isFinite)));
  return {
    summaries,
    legs: completeGeometry ? legPaths.map((path, index) => ({path, origin: stops[index], destination: stops[index + 1]})) : [],
    distanceKm: Math.round(legs.reduce((sum, leg) => sum + leg.distance!.value, 0) / 1000),
    path: completeGeometry ? legPaths.flat() : [],
    returnStartIndex: legPaths.slice(0, -1).reduce((count, points) => count + points.length, 0)
  };
}

export async function calculateRouteDistance(stops: string[]) {
  return (await calculateGoogleRoute(stops)).distanceKm;
}

export function CotizadorHome({
  additionalCatalog,
  clients,
  draft,
  previousQuotes,
  onDraftChange,
  onPrepareQuote,
  totals
}: {
  additionalCatalog: AdditionalDefinition[];
  clients: Client[];
  draft: TransportQuoteDraft;
  previousQuotes: PreparedQuote[];
  onDraftChange: (draft: TransportQuoteDraft) => void;
  onPrepareQuote: () => string | undefined;
  totals: CostTotals;
}) {
  const selectedClient = clients.find((client) => client.id === draft.clientId);
  const [stage, setStage] = useState(0);
  const [saveError, setSaveError] = useState('');
  const stageHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stageHeading.current?.focus(); }, [stage]);
  const contacts = getClientContacts(selectedClient);
  const selectedContact = contacts.find(item => item.key === draft.contactKey)?.contact;
  const routeStops = getRouteStops(draft);
  const routeKey = getTruckRouteKey(draft);
  const baseAmount = totals.perKm * draft.distanceKm + totals.perDay * draft.requiredDays;
  const additionalsAmount = draft.additionals.reduce(
    (total, item) => total + calculateAdditionalAmount(item, baseAmount),
    0
  );
  const tollSummary = summarizeTolls(draft);
  const tollReady = tollSummary.ready;
  const quoteCost = baseAmount + additionalsAmount + tollSummary.total;
  const utilityValid = isValidUtility(draft.utilityPercent);
  const quoteTariff = utilityValid ? calculateTariffFromCost(quoteCost, draft.utilityPercent) : null;
  const [routeStatus, setRouteStatus] = useState('');

  const latestDraft = useRef(draft);
  const latestOnChange = useRef(onDraftChange);
  latestDraft.current = draft;
  latestOnChange.current = onDraftChange;
  const manualDistanceVersion = useRef(0);
  const distanceKey = JSON.stringify([routeStops, draft.isRoundTrip, draft.returnFromStop]);
  const previousDistanceKey = useRef(distanceKey);
  const [distanceStatus, setDistanceStatus] = useState('');
  const googleRoute = useRef<(Awaited<ReturnType<typeof calculateGoogleRoute>> & { key: string }) | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const version = manualDistanceVersion.current;
    const changed = previousDistanceKey.current !== distanceKey;
    previousDistanceKey.current = distanceKey;
    if (changed || latestDraft.current.tollRouteKey !== routeKey) {
      latestDraft.current = { ...latestDraft.current, ...(changed ? { distanceKm: 0, requiredDays: 1 } : {}), tolls: [], tollListStatus: 'pending', tollRouteKey: routeKey };
      latestOnChange.current(latestDraft.current);
    }
    if (routeStops.length < 2 || routeStops.some(stop => !stop)) {
      setDistanceStatus('');
      setRouteStatus('');
      return;
    }
    if (routeStops.length > 26) {
      setDistanceStatus('');
      setRouteStatus('El recorrido admite hasta 25 tramos. Quitá una parada para calcularlo.');
      return;
    }
    const timeout = window.setTimeout(async () => {
      try {
        setDistanceStatus('Calculando kilómetros con Google…');
        const route = googleRoute.current?.key === distanceKey ? googleRoute.current : await (async () => {
          await loadGooglePlaces();
          return { ...await calculateGoogleRoute(routeStops), key: distanceKey };
        })();
        if (!active || JSON.stringify([getRouteStops(latestDraft.current), latestDraft.current.isRoundTrip, latestDraft.current.returnFromStop]) !== distanceKey) return;
        googleRoute.current = route;
        if (version === manualDistanceVersion.current) {
          latestDraft.current = { ...latestDraft.current, distanceKm: route.distanceKm, requiredDays: calculateRequiredDays(route.distanceKm) };
          latestOnChange.current(latestDraft.current);
          setDistanceStatus('Google: preferencia por autopistas, rutas y avenidas entre alternativas hasta un 10% más largas que la más corta. Recorrido por tramo: ' + route.summaries.join(' → ') + '. Ruta sin verificar para tránsito pesado.');
        } else setDistanceStatus('Kilómetros editados manualmente. Peajes estimados sobre la ruta de Google.');
        if (route.path.length < 2) throw new Error('Google no devolvió el trazado necesario para estimar peajes.');
        setRouteStatus('Estimando estaciones sobre el trazado de Google…');
        const response = await fetch('/.netlify/functions/route-tolls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ legs: route.legs, isRoundTrip: latestDraft.current.isRoundTrip,
            returnStartLeg: latestDraft.current.returnFromStop === -1 ? route.legs.length : latestDraft.current.returnFromStop })
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.tolls)) throw new Error(result.error || 'No se pudo estimar el listado de peajes.');
        if (!active || JSON.stringify([getRouteStops(latestDraft.current), latestDraft.current.isRoundTrip, latestDraft.current.returnFromStop]) !== distanceKey) return;
        latestDraft.current = { ...latestDraft.current, tolls: mergeRouteTolls(result.tolls, latestDraft.current.tolls), tollListStatus: 'pending', tollRouteKey: getTruckRouteKey(latestDraft.current) };
        latestOnChange.current(latestDraft.current);
        setRouteStatus('');
      } catch (error) {
        if (active) {
          if (googleRoute.current?.key !== distanceKey) setDistanceStatus('No se pudo calcular con Google. Podés cargar los kilómetros manualmente.');
          setRouteStatus(error instanceof Error ? error.message : 'No se pudo estimar peajes. Revisá los datos del recorrido.');
        }
      }
    }, 700);
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [distanceKey]);

  const [officialStatus, setOfficialStatus] = useState('');
  const officialLookupKey = JSON.stringify([draft.tollPayment, draft.tolls.map(toll => [toll.id, toll.name, toll.operator, toll.period, toll.direction, toll.payment, toll.source === 'manual' && toll.amount !== null])]);
  useEffect(() => {
    const current = latestDraft.current;
    const candidates = current.tolls.filter(toll => toll.name.trim() && !(toll.source === 'manual' && toll.amount !== null));
    if (!current.tolls.length) { setOfficialStatus('Las tarifas se consultarán automáticamente cuando se identifiquen los peajes del recorrido.'); return; }
    if (!candidates.length) { setOfficialStatus(current.tolls.some(toll => !toll.name.trim()) ? 'Completá el nombre del peaje para buscar su tarifa.' : 'Todos los importes son manuales. Vaciá el importe que quieras consultar; tus correcciones no se reemplazan.'); return; }
    let active = true;
    const controller = new AbortController();
    const stamp = (toll: RouteToll) => JSON.stringify([toll.name, toll.operator, toll.period, toll.direction, toll.payment ?? current.tollPayment]);
    const timer = window.setTimeout(async () => {
      setOfficialStatus('Buscando publicaciones oficiales de las concesionarias…');
      const beforeLookup = latestDraft.current;
      latestOnChange.current({ ...beforeLookup, tolls: beforeLookup.tolls.map(toll =>
        candidates.some(item => item.id === toll.id) && toll.source === 'official'
          ? { ...toll, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: 'Verificando publicación actual…' } : toll
      ) });
      try {
        const response = await fetch('/.netlify/functions/official-tolls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ axles: 6, tolls: candidates.map(toll => ({ id: toll.id, name: toll.name, operator: toll.operator, period: toll.period, direction: toll.direction, payment: toll.payment ?? current.tollPayment })) })
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('No se pudo consultar las publicaciones. Podés completar los importes manualmente.');
        const result = await response.json();
        if (!Array.isArray(result.tolls)) throw new Error('Respuesta de tarifas inválida.');
        if (!active) return;
        const latest = latestDraft.current;
        if (getTruckRouteKey(latest) !== getTruckRouteKey(current)) return;
        latestOnChange.current({ ...latest, tolls: latest.tolls.map(toll => {
          const sent = candidates.find(item => item.id === toll.id);
          const found = result.tolls.find((item: RouteToll) => item.id === toll.id);
          if (!sent || !found || stamp(sent) !== stamp(toll) || (toll.source === 'manual' && toll.amount !== null)) return toll;
          return { ...toll, operator: toll.operator || found.operator, amount: typeof found.amount === 'number' && Number.isFinite(found.amount) && found.amount >= 0 ? found.amount : null,
            source: found.source === 'official' ? 'official' : 'pending', sourceUrl: found.sourceUrl, sourcePage: found.sourcePage,
            category: found.category, checkedAt: found.checkedAt, lookupMessage: found.lookupMessage };
        }) });
        const verified = result.tolls.filter((item: RouteToll) => item.source === 'official' && item.amount !== null).length;
        const pendingReasons = [...new Set<string>(result.tolls
          .filter((item: RouteToll) => item.amount === null && item.lookupMessage && !item.lookupMessage.startsWith('Para calcular el precio de '))
          .map((item: RouteToll) => item.lookupMessage as string))];
        setOfficialStatus([
          verified ? `${verified} tarifa(s) completada(s) automáticamente.` : '',
          ...pendingReasons
        ].filter(Boolean).join(' '));
      } catch (error) {
        if (active) setOfficialStatus(error instanceof Error ? error.message : 'No se pudo consultar las publicaciones.');
      }
    }, 800);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [officialLookupKey]);

  const updateDraft = <K extends keyof TransportQuoteDraft>(field: K, value: TransportQuoteDraft[K]) => {
    const routeFields = ['transportKind','base','origin','destination','emptyPickup','consolidationDestination','deliveryPort','fullPickupPort','deconsolidationDestination','emptyReturnYard','isRoundTrip','intermediateStops'];
    setSaveError('');
    onDraftChange({ ...draft, ...(field === 'clientId' ? {contactKey: undefined} : {}), ...(routeFields.includes(field) ? {returnFromStop: undefined} : {}), [field]: value });
  };

  const mainStopLabels = draft.transportKind === 'expo' ? ['Base','Retiro de vacío','Consolidado','Puerto de entrega']
    : draft.transportKind === 'impo' ? ['Base','Retiro de cargado','Desconsolidado','Devolución de vacío'] : draft.transportKind === 'otro' ? ['Origen','Destino'] : ['Base','Lugar de carga','Lugar de descarga'];
  const segmentLabels = [...mainStopLabels.slice(0,-1).map((label,index) => `${label} → ${mainStopLabels[index+1]}`),
    ...(draft.isRoundTrip ? [`${mainStopLabels[mainStopLabels.length-1]} → ${mainStopLabels[0]} (regreso)`] : [])];
  const intermediateStops = (draft.intermediateStops ?? []).filter(stop => stop.transportKind === draft.transportKind)
    .sort((a,b) => a.afterStop - b.afterStop);
  const editIntermediate = (id: string, changes: Partial<IntermediateStop>) => updateDraft('intermediateStops',
    (draft.intermediateStops ?? []).map(stop => stop.id === id ? {...stop,...changes} : stop));
  const moveIntermediate = (id: string, offset: number) => {
    const all = [...(draft.intermediateStops ?? [])];
    const current = all.findIndex(stop => stop.id === id);
    const peers = all.map((stop,index) => ({stop,index})).filter(({stop}) => stop.transportKind === draft.transportKind && stop.afterStop === all[current].afterStop);
    const peerIndex = peers.findIndex(({index}) => index === current);
    const target = peers[peerIndex + offset]?.index;
    if (target === undefined) return;
    [all[current],all[target]] = [all[target],all[current]];
    updateDraft('intermediateStops', all);
  };

  const addManualToll = (journey: 'outbound' | 'return') => {
    onDraftChange({ ...draft, tollListStatus: 'pending', tolls: [...draft.tolls, {
      id: 'manual:' + crypto.randomUUID(), journey, name: '', locality: '', road: '', province: '',
      travelSense: '', amount: null, source: 'manual', payment: '', operator: ''
    }] });
  };

  const [additionalEdits, setAdditionalEdits] = useState<Record<string, QuoteAdditionalSelection>>({});
  const additionalRows = additionalCatalog.map(definition => {
    const selected = draft.additionals.find(item => item.catalogId === definition.id || (!item.catalogId && item.name === definition.name));
    return { selected: Boolean(selected), item: selected ?? additionalEdits[definition.id] ?? createAdditionalSelection(definition,
      definition.kind === 'fixed' ? findPreviousAdditionalAmount(previousQuotes, draft.clientId, definition.name) : undefined) };
  });
  for (const item of draft.additionals) {
    if (!additionalRows.some(row => row.item.id === item.id)) additionalRows.push({selected: true, item});
  }
  const toggleAdditional = (item: QuoteAdditionalSelection, checked: boolean) => {
    setAdditionalEdits(values => ({...values, [item.catalogId ?? item.id]: item}));
    updateDraft('additionals', checked ? [...draft.additionals, item] : draft.additionals.filter(other => other.id !== item.id));
  };
  const updateAdditional = (item: QuoteAdditionalSelection, field: 'amount' | 'discountPercent' | 'confirmedDifferentAmount', value: number | boolean) => {
    const nextItem = { ...item, [field]: value };
    if (field === 'amount' && item.previousAmount !== undefined && Number(value) !== item.previousAmount) nextItem.confirmedDifferentAmount = false;
    setAdditionalEdits(values => ({...values, [item.catalogId ?? item.id]: nextItem}));
    if (draft.additionals.some(other => other.id === item.id)) updateDraft('additionals', draft.additionals.map(other => other.id === item.id ? nextItem : other));
  };

  const stageErrors = getQuoteStageErrors(draft, clients);
  const canPrepare = stageErrors.every(error => !error);
  const roundedTariff = quoteTariff === null ? null : roundQuoteTariff(quoteTariff,draft.roundingUnit);
  const exactCurrency = (value: number) => value.toLocaleString('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2});
  const changeStage = (next: number) => { setSaveError(''); setStage(next); };

  return (
    <div className="quote-wizard">
      <header className="topbar quote-topbar"><div><h1>Cotizador</h1><p className="page-description">Etapa {stage+1} de {quoteStages.length}</p></div></header>
      <nav className="quote-steps" aria-label="Etapas del cotizador">{quoteStages.map((label,index) => <button key={label} type="button" aria-current={stage===index ? 'step' : undefined} disabled={index>stage} onClick={() => changeStage(index)}><span>{index+1}</span>{label}</button>)}</nav>
      <div className="panel wizard-panel">
        <div className="panel-header"><h2 ref={stageHeading} tabIndex={-1}>{quoteStages[stage]}</h2><span>{stage+1} / 6</span></div>
        <section hidden={stage!==0} aria-label="Datos del cliente">
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
            <label>Contacto<select aria-label="Contacto" value={draft.contactKey ?? ''} onChange={event => updateDraft('contactKey',event.target.value as ContactKey)}>
              <option value="">Seleccionar contacto</option>{contacts.map(item => <option key={item.key} value={item.key}>{item.contact.fullName} · {item.label}</option>)}
            </select></label>
          </div>
          {selectedContact && <p className="contact-summary">{selectedContact.role} · {selectedContact.email || 'Sin email'} · {selectedContact.phone || 'Sin teléfono'}</p>}
        </section>
        <section hidden={stage!==1} aria-label="Descripción del servicio">
          <div className="form-grid">
            <label>
              Tipo transporte
              <select value={draft.transportKind} onChange={(event) => updateDraft('transportKind', event.target.value as TransportKind)}>
                <option value="expo">Expo</option>
                <option value="impo">Impo</option>
                <option value="carreton">Carretón</option><option value="distribucion">Distribución</option><option value="carga-suelta">Carga suelta</option>{draft.transportKind === 'otro' && <option value="otro">Otro (anterior)</option>}
              </select>
            </label>
            <label>
              Base de salida
              <select value={baseName(draft.base)} onChange={(event) => updateDraft('base', event.target.value)}>
                <option>{LAVAISSE_BASE}</option>
                <option>{BERISSO_BASE}</option>
              </select>
              <small>{routeAddress(draft.base)}</small>
            </label>
            <label>Modalidad del viaje<select value={draft.isRoundTrip ? 'roundtrip' : 'oneway'} onChange={event => updateDraft('isRoundTrip',event.target.value === 'roundtrip')}><option value="roundtrip">Roundtrip</option><option value="oneway">Solo ida</option></select></label>
          </div>


          {draft.transportKind === 'expo' && (
            <div className="form-grid route-grid">
              <AddressField label="Retiro de vacío" value={draft.emptyPickup} onChange={(value) => updateDraft('emptyPickup', value)} />
              <AddressField label="Lugar de consolidado" value={draft.consolidationDestination} onChange={(value) => updateDraft('consolidationDestination', value)} />
              <AddressField label="Entrega de cargado" value={draft.deliveryPort} onChange={(value) => updateDraft('deliveryPort', value)} />
            </div>
          )}

          {draft.transportKind === 'impo' && (
            <div className="form-grid route-grid">
              <AddressField label="Retiro de cargado" value={draft.fullPickupPort} onChange={(value) => updateDraft('fullPickupPort', value)} />
              <AddressField label="Lugar de desconsolidado" value={draft.deconsolidationDestination} onChange={(value) => updateDraft('deconsolidationDestination', value)} />
              <AddressField label="Devolución de vacío" value={draft.emptyReturnYard} onChange={(value) => updateDraft('emptyReturnYard', value)} />
            </div>
          )}

          {draft.transportKind !== 'expo' && draft.transportKind !== 'impo' && (
            <div className="form-grid route-grid">
              <AddressField label="Lugar de carga" value={draft.origin} onChange={(value) => updateDraft('origin', value)} />
              <AddressField label="Lugar de descarga" value={draft.destination} onChange={(value) => updateDraft('destination', value)} />
            </div>
          )}

          <section className="intermediate-stops" aria-label="Paradas intermedias">
            <div className="panel-header"><h3>Paradas intermedias</h3>
              <button type="button" className="ghost-button" disabled={routeStops.length >= 26} onClick={() => updateDraft('intermediateStops', [...(draft.intermediateStops ?? []),
                {id: crypto.randomUUID(), address: '', afterStop: 0, transportKind: draft.transportKind}])}><Plus size={16} /> Agregar parada</button>
            </div>
            {intermediateStops.map((stop,index) => {
              const peers = intermediateStops.filter(other => other.afterStop === stop.afterStop);
              const peerIndex = peers.findIndex(other => other.id === stop.id);
              return <div className="intermediate-stop" key={stop.id}>
                <div className="form-grid">
                  <AddressField label={'Parada intermedia ' + (index+1)} value={stop.address} onChange={address => editIntermediate(stop.id,{address})} />
                  <label>Ubicación en el recorrido<select aria-label={'Tramo de parada ' + (index+1)} value={stop.afterStop} onChange={event => editIntermediate(stop.id,{afterStop:Number(event.target.value)})}>
                    {segmentLabels.map((label,segment) => <option key={segment} value={segment}>{label}</option>)}
                    {stop.afterStop >= segmentLabels.length && <option value={stop.afterStop}>Regreso · Roundtrip desactivado</option>}
                  </select></label>
                </div>
                {stop.afterStop >= segmentLabels.length && <p className="muted-copy">Esta parada de regreso no se incluye mientras Roundtrip esté desactivado.</p>}
                <div className="intermediate-actions">
                  <button type="button" className="ghost-button" aria-label={'Subir parada ' + (index+1)} disabled={peerIndex === 0} onClick={() => moveIntermediate(stop.id,-1)}>Subir</button>
                  <button type="button" className="ghost-button" aria-label={'Bajar parada ' + (index+1)} disabled={peerIndex === peers.length-1} onClick={() => moveIntermediate(stop.id,1)}>Bajar</button>
                  <button type="button" className="ghost-button" aria-label={'Quitar parada ' + (index+1)} onClick={() => updateDraft('intermediateStops',(draft.intermediateStops ?? []).filter(other => other.id !== stop.id))}>Quitar</button>
                </div>
              </div>;
            })}
          </section>


        </section>
        <section hidden={stage!==2} aria-label="Cálculo de cotización">
          <div className="form-grid">
            <label>
              Kilómetros recorridos
              <input
                min="0"
                type="number"
                value={draft.distanceKm}
                onChange={(event) => {
                  manualDistanceVersion.current += 1;
                  const distanceKm = Number(event.target.value);
                  onDraftChange({
                    ...draft,
                    distanceKm,
                    requiredDays: calculateRequiredDays(distanceKm)
                  });
                }}
              />
            </label>
            <label>
              Días de operación
              <input min="1" type="number" value={draft.requiredDays} onChange={(event) => { manualDistanceVersion.current += 1; updateDraft('requiredDays', Number(event.target.value)); }} />
            </label>
            <label>
              Utilidad %
              <input
                max="99.99"
                min="0"
                step="0.01"
                type="number"
                aria-label="Utilidad %"
                value={draft.utilityPercent}
                required
                aria-invalid={!utilityValid}
                aria-describedby={!utilityValid ? 'utility-error' : undefined}
                onChange={(event) => updateDraft('utilityPercent', event.target.value === '' ? '' : event.target.valueAsNumber)}
              />
              {!utilityValid && <span id="utility-error" className="field-error" role="alert">Ingresá una utilidad entre 0 y menos de 100.</span>}
            </label>
          </div>
          <div className="metric-grid wizard-costs"><Metric label="Costo del viaje" value={currency.format(baseAmount)} hint="Kilómetros × costo por km + días × costo por día" /><Metric label="Costo por kilómetro" value={currency.format(totals.perKm)} hint="Estructura de costos" /><Metric label="Costo por día" value={currency.format(totals.perDay)} hint="800 km por día de operación" /></div>
          {distanceStatus && <p className="muted-copy route-status" role="status">{distanceStatus}</p>}
        </section>
        <section hidden={stage!==3} aria-label="Etapa de peajes">
          <section className="toll-section" aria-label="Peajes para camión">
            <div className="panel-header">
              <div><p className="eyebrow">Tránsito pesado</p><h2>Peajes del recorrido</h2></div>
              <Truck size={20} />
            </div>
            <p className="muted-copy">Tractor de 3 ejes + araña de 3 ejes · 6 ejes en total. Una fila por cada paso de peaje, incluida la vuelta.</p>
            {routeStatus && <p className="muted-copy route-status" role="status">{routeStatus}</p>}
            {draft.tolls.length === 0 && <p className="muted-copy">{draft.tollListStatus === 'pending' ? 'Todavía no se identificaron las estaciones del recorrido. Se detectan automáticamente al completar el recorrido.' : 'Recorrido confirmado sin peajes.'}</p>}
            <p className="muted-copy"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Estaciones: © OpenStreetMap contributors (ODbL)</a>. Detección aproximada, editable.</p>
            <p className="muted-copy">El precio se busca automáticamente al completar los datos de cada pasada. Catálogo nacional: {operatorCatalog.operators.length} operadores. Las tarifas de seis ejes sin verificar quedan pendientes.</p>
            <details className="truck-profile">
              <summary>Consultar concesionarias y fuentes oficiales</summary>
              <p className="muted-copy">Revisado el {operatorCatalog.reviewedOn}. Las concesiones en transición requieren confirmar el operador vigente.</p>
              {operatorCatalog.operators.map(operator => <p className="toll-source" key={operator.id}><a href={operator.page} target="_blank" rel="noreferrer">{operator.name}</a> · {operator.scope}{operator.notes ? ' · ' + operator.notes : ''}</p>)}
              <h3>Adjudicaciones pendientes de confirmar operación</h3>
              {operatorCatalog.transitions.map(item => <p className="toll-source" key={item.id}><a href={item.source} target="_blank" rel="noreferrer">{item.tramo}</a> · {item.adjudicatario}. {item.status}</p>)}
              {operatorCatalog.unresolved.map(item => <p className="toll-source" key={item.tramo}><a href={item.source} target="_blank" rel="noreferrer">{item.tramo}</a> · {item.reason}</p>)}
            </details>
            {officialStatus && <p className="toll-source tariff-lookup-status" role="status">{officialStatus}</p>}
            <div className={'toll-journeys' + (draft.isRoundTrip ? ' toll-journeys-roundtrip' : '')}>
            {getTollGroups(draft).map(group => (
              <section className={'toll-journey' + (group.id === 'unknown' ? ' toll-journey-unknown' : '')} key={group.id} aria-label={group.title}>
                <div className="toll-journey-heading">
                  <h3>{group.title}</h3>
                  <span>{group.rows.length} {group.rows.length === 1 ? 'pasada' : 'pasadas'}</span>
                </div>
                {group.rows.length === 0 && <p className="muted-copy">{draft.tollListStatus === 'pending' ? 'Sin estaciones identificadas todavía.' : 'Sin peajes registrados en este tramo.'}</p>}
                <div className="toll-list">
              {group.rows.map(({ toll, index }, groupIndex) => (
                <div className="toll-card" key={toll.id}>
                  <div className="toll-card-heading"><strong>{group.id === 'return' ? 'Vuelta' : group.id === 'outbound' ? 'Ida' : 'Tramo sin identificar'} · Paso {groupIndex + 1}</strong><span>{toll.source === 'official' ? 'Publicación oficial · 6 ejes' : toll.source === 'automatic' ? 'Tarifa estimada · 6 ejes' : toll.amount === null ? 'Importe pendiente' : 'Importe manual'}</span></div>
                  {toll.id.startsWith('manual:')
                    ? <label>Sentido de circulación<input aria-label={'Sentido manual del peaje ' + (index + 1)} placeholder="Ej.: Hacia CABA" value={toll.travelSense ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? {...item, travelSense: event.target.value} : item))} /></label>
                    : <p className="toll-travel-sense"><strong>{toll.travelSense || 'Sentido de circulación pendiente de identificar'}</strong></p>}
                  <div className="form-grid">
                    <label>Nombre del peaje<input aria-label={'Nombre del peaje ' + (index + 1)} value={toll.name} placeholder="Completar nombre" onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, name: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))} /></label>
                    <label>Localidad<input aria-label={'Localidad del peaje ' + (index + 1)} value={toll.locality} placeholder="Localidad no informada" onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, locality: event.target.value } : item))} /></label>
                    <label>Importe (ARS)<input aria-label={'Importe del peaje ' + (index + 1)} type="number" min="0" step="0.01" placeholder="Completar tarifa" value={toll.amount ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, amount: event.target.value === '' ? null : Math.max(0, Number(event.target.value)), source: 'manual' } : item))} /></label>
                  </div>
                  <div className="form-grid">
                    <label>Forma de pago en esta estación<select aria-label={'Pago del peaje ' + (index + 1)} value={toll.payment ?? draft.tollPayment} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, payment: event.target.value as NonNullable<RouteToll['payment']>, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Seleccionar</option><option value="tag">TelePASE</option><option value="cash">Efectivo</option><option value="electronic">Electrónico manual (QR / tarjeta)</option>
                    </select></label>
                    <label>Concesionaria<select aria-label={'Concesionaria del peaje ' + (index + 1)} value={toll.operator ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, operator: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Seleccionar</option>{operatorCatalog.operators.map(operator => <option key={operator.id} value={operator.id}>{operator.name}</option>)}<option value="other">Otra concesionaria</option>
                    </select></label>
                    <label>Horario del paso<select aria-label={'Horario del peaje ' + (index + 1)} value={toll.period ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, period: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Confirmar</option><option value="normal">No pico</option><option value="peak">Pico</option>
                    </select></label>
                    {toll.operator === 'aubasa' && <label>Sentido del paso<select aria-label={'Sentido del peaje ' + (index + 1)} value={toll.direction ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, direction: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Confirmar</option><option value="la-plata">CABA → La Plata</option><option value="caba">La Plata → CABA</option><option value="both">Ruta 2 / 11 / 74</option>
                    </select></label>}
                  </div>
                  {toll.stationSourceUrl && <p className="toll-source"><a href={toll.stationSourceUrl} target="_blank" rel="noreferrer">Ver estación en el mapa</a> · Localidad aproximada: revisar</p>}
                  {toll.lookupMessage && !toll.lookupMessage.startsWith('Para calcular el precio de ') && <p className="toll-source">{toll.lookupMessage}</p>}
                  {!toll.sourceUrl && toll.sourcePage && <p className="toll-source"><a href={toll.sourcePage} target="_blank" rel="noreferrer">Consultar fuente de la concesionaria</a> · Importe pendiente de verificación</p>}
                  {toll.sourceUrl && <p className="toll-source"><a href={toll.sourceUrl} target="_blank" rel="noreferrer">Ver publicación oficial</a> · Categoría {toll.category} · Consultada {toll.checkedAt ? new Date(toll.checkedAt).toLocaleString('es-AR') : ''}{toll.source === 'manual' ? ' · Importe corregido manualmente' : ''}</p>}
                  <div className="toll-card-heading"><small>{[toll.road, toll.province].filter(Boolean).join(' · ')}</small>
                    {<button className="ghost-button" type="button" aria-label={'Quitar peaje ' + (index + 1)} onClick={() => onDraftChange({ ...draft, tolls: draft.tolls.filter(item => item.id !== toll.id), tollListStatus: 'pending' })}>Quitar</button>}
                  </div>
                </div>
              ))}
                </div>
                <div className="toll-journey-total">
                  <span>{group.rows.some(({ toll }) => toll.amount === null) || draft.tollListStatus === 'pending' ? 'Subtotal cargado' : 'Total del tramo'}</span>
                  <strong>{currency.format(group.rows.reduce((total, { toll }) => total + (toll.amount ?? 0), 0))}</strong>
                </div>
                {group.id !== 'unknown' && <button className="ghost-button" type="button" onClick={() => addManualToll(group.id === 'return' ? 'return' : 'outbound')}>
                  <Plus size={16} /> Agregar peaje de {group.id === 'return' ? 'vuelta' : 'ida'}
                </button>}
              </section>
            ))}
            </div>
            {draft.tollListStatus !== 'detected' && <label className="check-inline toll-confirm"><input type="checkbox" checked={draft.tollListStatus === 'manual'} onChange={event => updateDraft('tollListStatus', event.target.checked ? 'manual' : 'pending')} />{draft.tolls.length ? 'Confirmo que revisé todos los peajes estimados del recorrido' : 'Confirmo que este recorrido no tiene peajes'}</label>}
            <div className="toll-total" aria-live="polite"><span>{tollReady ? 'Total peajes' : 'Subtotal peajes cargados'}</span><strong>{currency.format(tollSummary.total)}</strong></div>
            {!tollReady && <p className="toll-source">{tollSummary.pending ? 'Falta completar ' + tollSummary.pending + ' peaje(s). La tarifa final se habilita cuando todos estén completos.' : 'Falta confirmar el listado del recorrido.'}</p>}
            <details className="truck-profile" open={!draft.truck.height || !draft.truck.weight || !draft.truck.length}>
              <summary>Dimensiones del conjunto · tractor 3 + araña 3</summary>
              <div className="form-grid">
                {([{ field: 'height', label: 'Altura total (m)', max: 6 }, { field: 'weight', label: 'Peso bruto cargado (t)', max: 100 }, { field: 'length', label: 'Largo total (m)', max: 30 }] as const).map(item => (
                  <label key={item.field}>{item.label}<input type="number" min="0.1" max={item.max} step="0.01" placeholder="Confirmar" value={draft.truck[item.field] || ''} onChange={event => updateDraft('truck', { ...draft.truck, [item.field]: Number(event.target.value) })} /></label>
                ))}
              </div>
            </details>
          </section>
        </section>
        <section hidden={stage!==4} aria-label="Etapa de adicionales">
          <div className="additional-list">
            {additionalRows.length === 0 ? (
              <p className="muted-copy">Creá los adicionales en el ABM de Adicionales.</p>
            ) : (
              additionalRows.map(({item, selected}) => {
                const hasDifferentPrevious = item.previousAmount !== undefined && item.previousAmount !== item.amount && !item.confirmedDifferentAmount;

                return (
                  <div className={`additional-row quote-additional-row ${selected ? 'is-selected' : ''} ${selected && hasDifferentPrevious ? 'needs-confirmation' : ''}`} key={item.id}>
                    <div><label className="check-inline"><input type="checkbox" aria-label={'Incluir ' + item.name} checked={selected} onChange={event => toggleAdditional(item,event.target.checked)} /><strong>{item.name}</strong></label>{item.description && <p>{item.description}</p>}<small>{selected ? 'Total adicional: ' + currency.format(calculateAdditionalAmount(item, baseAmount)) : 'No incluido'}</small></div>
                    <label>
                      {item.kind === "percent" ? "% del transporte" : "Importe ($)"}
                      <input aria-label={"Valor de " + item.name} type="number" min="0" step="0.01" value={item.amount} onChange={(event) => updateAdditional(item, 'amount', Math.max(0, Number(event.target.value)))} />
                    </label>
                    <label>
                      Bonif. %
                      <input
                        max="100"
                        min="0"
                        type="number"
                        value={item.discountPercent}
                        onChange={(event) => updateAdditional(item, 'discountPercent', Math.min(100, Math.max(0, Number(event.target.value))))}
                      />
                    </label>
                    {item.previousAmount !== undefined && <span>Anterior: {currency.format(item.previousAmount)}</span>}
                    {selected && hasDifferentPrevious && (
                      <label className="check-inline warning-check">
                        <input
                          checked={item.confirmedDifferentAmount}
                          type="checkbox"
                          onChange={(event) => updateAdditional(item, 'confirmedDifferentAmount', event.target.checked)}
                        />
                        Confirmar diferencia
                      </label>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
        <section hidden={stage!==5} aria-label="Detalle final">
          <div className="review-details"><div><h3>Cliente y contacto</h3><p><strong>{selectedClient?.alias || selectedClient?.businessName}</strong></p><p>{selectedClient?.businessName} · CUIT {selectedClient?.cuit}</p><p>{selectedContact?.fullName} · {selectedContact?.role}</p><p>{selectedContact?.email} · {selectedContact?.phone}</p><p>Solicitud: {draft.requestDate} · Cotización: {draft.quoteDate}</p></div>
          <div><h3>Servicio</h3><p>{transportLabels[draft.transportKind]} · {draft.isRoundTrip ? 'Roundtrip' : 'Solo ida'}</p><p>{baseName(draft.base)} · {routeAddress(draft.base)}</p><p>{draft.distanceKm.toLocaleString('es-AR')} km · {draft.requiredDays} día(s) de operación</p></div></div>
          <h3>Recorrido y paradas</h3><ol className="review-route">{routeStops.map((stop,index) => <li key={index}>{stop}</li>)}</ol>
          <div className="review-details"><div><h3>Costos y tarifa</h3><dl className="review-totals">
            <div><dt>Subtotal costo del viaje</dt><dd>{exactCurrency(baseAmount)}</dd></div>
            <div><dt>Peajes</dt><dd>{exactCurrency(tollSummary.total)}</dd></div>
            <div><dt>Adicionales</dt><dd>{exactCurrency(additionalsAmount)}</dd></div>
            <div className="review-emphasis"><dt>Total costo</dt><dd>{exactCurrency(quoteCost)}</dd></div>
            <div><dt>Utilidad</dt><dd>{utilityValid ? draft.utilityPercent+'%' : 'Pendiente'}</dd></div>
            <div><dt>Tarifa sin redondeo</dt><dd>{quoteTariff === null ? 'Pendiente' : exactCurrency(quoteTariff)}</dd></div>
          </dl><p className="tariff-formula">Tarifa = total costo / (1 − utilidad / 100)</p>
          <label className="rounding-control">Redondeo<select value={draft.roundingUnit ?? 0} onChange={event => updateDraft('roundingUnit',Number(event.target.value))}><option value={0}>Sin redondeo adicional</option><option value={1}>Al peso superior</option><option value={100}>Al múltiplo superior de $100</option><option value={1000}>Al múltiplo superior de $1.000</option></select></label>
          <p>Ajuste por redondeo: {roundedTariff === null || quoteTariff === null ? 'Pendiente' : exactCurrency(roundedTariff-quoteTariff)}</p>
          <div className="toll-total"><span>Tarifa final</span><strong>{roundedTariff === null ? 'Pendiente' : exactCurrency(roundedTariff)}</strong></div></div>
          <div><h3>Peajes incluidos</h3>{getTollGroups(draft).map(group => <div key={group.id}><h4>{group.title}</h4>{!group.rows.length ? <p>Sin peajes.</p> : <ul>{group.rows.map(({toll}) => <li key={toll.id}>{toll.name} · {toll.locality} · {toll.travelSense || 'Sentido sin informar'} — {toll.amount === null ? 'Pendiente' : exactCurrency(toll.amount)}</li>)}</ul>}</div>)}
          <h3>Adicionales incluidos</h3>{!draft.additionals.length ? <p>Sin adicionales.</p> : <ul className="review-additionals">{draft.additionals.map(item => <li key={item.id}><strong>{item.name} — {exactCurrency(calculateAdditionalAmount(item,baseAmount))}</strong><p>{item.kind==='percent' ? item.amount+'% del transporte' : exactCurrency(item.amount)} · Bonificación {item.discountPercent}%</p>{item.description && <p>{item.description}</p>}</li>)}</ul>}</div></div>
        </section>
      </div>
      <footer className="wizard-footer">
        <button className="ghost-button" type="button" disabled={stage===0} onClick={() => changeStage(stage-1)}>Anterior</button>
        <p role="status">{saveError || (stage===5 ? stageErrors.find(Boolean) : stageErrors[stage]) || ''}</p>
        {stage<5 ? <button className="primary-button" type="button" disabled={Boolean(stageErrors[stage])} onClick={() => changeStage(stage+1)}>Siguiente</button>
          : <button className="primary-button" type="button" disabled={!canPrepare} onClick={() => {try {setSaveError(onPrepareQuote() || '');} catch(error) {setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la cotización.');}}}><Save size={20} /> Guardar</button>}
      </footer>
    </div>
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
                      <strong>{quoteItem.clientName || client?.alias || 'Cliente'}</strong>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const showBeginning = () => {
    const input = inputRef.current;
    if (!input) return;
    input.setSelectionRange(0, 0);
    input.scrollLeft = 0;
  };

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let listener: { remove: () => void } | null = null;
    let isMounted = true;

    loadGooglePlaces()
      .then(() => {
        if (!isMounted || !inputRef.current || !window.google?.maps?.places) {
          return;
        }

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'name']
        });

        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          onChangeRef.current(place.formatted_address || place.name || inputRef.current?.value || '');
          requestAnimationFrame(showBeginning);
        });
      })
      .catch(() => {
        // If Google Places is not available, the field remains editable as a normal input.
      });

    return () => {
      isMounted = false;
      listener?.remove();
    };
  }, []);

  return (
    <label>
      {label}
      <input
        ref={inputRef}
        autoComplete="off"
        placeholder="Direccion, ciudad o puerto"
        value={value}
        title={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => { showBeginning(); requestAnimationFrame(showBeginning); }}
      />
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
