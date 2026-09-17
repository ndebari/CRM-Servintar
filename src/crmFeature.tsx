import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  ClipboardList,
  FileText,
  Plus,
  Save,
  SquarePen,
  Trash2,
  Truck,
  Users
} from 'lucide-react';

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
              waypoints?: { location: string; stopover: boolean }[];
            },
            callback: (
              result: {
                routes?: {
                  legs?: {
                    steps?: { path?: { lat: () => number; lng: () => number }[] }[];
                    distance?: {
                      value: number;
                    };
                  }[];
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

export type AdditionalDefinition = { id: string; name: string; description: string; kind: 'fixed' | 'percent' };

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
  payment?: "" | "tag" | "cash";
  operator?: string; period?: string; direction?: string; stationSourceUrl?: string;
  sourceUrl?: string; sourcePage?: string; category?: string; checkedAt?: string; lookupMessage?: string;
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
  utilityPercent: number;
  tolls: RouteToll[];
  tollListStatus: "pending" | "detected" | "manual";
  tollRouteKey: string;
  truck: { tractorAxles: number; height: number; weight: number; length: number };
  /** Legacy payment, used only for existing rows without their own selection. */
  tollPayment: "" | "tag" | "cash";
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
export const initialAdditionals: AdditionalDefinition[] = ['Devolucion de vacio dia siguiente', 'Demora en la carga', 'Demora en la descarga', 'Pernocte', 'Inhabil'].map((name, index) => ({ id: 'adicional-base-' + index, name, description: '', kind: 'fixed' }));

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
    isRoundTrip: true,
    distanceKm: 0,
    requiredDays: 1,
    utilityPercent: 0,
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

function calculateTariffFromCost(cost: number, utilityPercent: number) {
  if (utilityPercent >= 100) {
    return cost;
  }

  return cost / ((100 - utilityPercent) / 100);
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
  const totalAmount = calculateTariffFromCost(totalCost, draft.utilityPercent);
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
      `Kilometros considerados: ${draft.distanceKm.toLocaleString('es-AR')} km.`,
      `Dias operativos considerados: ${draft.requiredDays}.`,
      '',
      `Transporte base: ${currency.format(baseAmount)}`,
      "Peajes · tractor 3 ejes + araña 3 ejes:",
      ...draft.tolls.map((toll, index) => "- Paso " + (index + 1) + ": " + toll.name + " — " + toll.locality + ": " + currency.format(toll.amount!) + (toll.source === "manual" ? " (manual)" : "")),
      "Total peajes: " + currency.format(tollSummary.total),
      'Adicionales:',
      additionalsText,
      '',
      `Costo total: ${currency.format(totalCost)}`,
      `Utilidad aplicada: ${draft.utilityPercent}%`,
      `Total cotizado: ${currency.format(totalAmount)}`,
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

function getRouteStops(draft: TransportQuoteDraft) {
  const stops =
    draft.transportKind === 'expo'
      ? [draft.base, draft.emptyPickup, draft.consolidationDestination, draft.deliveryPort]
      : draft.transportKind === 'impo'
        ? [draft.base, draft.fullPickupPort, draft.deconsolidationDestination, draft.emptyReturnYard]
        : [draft.origin, draft.destination];
  const cleanStops = stops.map((stop) => stop.trim());

  if (draft.isRoundTrip && cleanStops.length > 1) {
    return [...cleanStops, cleanStops[0]];
  }

  return cleanStops;
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

export function mergeRouteTolls(incoming: RouteToll[], previous: RouteToll[]) {
  const merged = incoming.map(toll => {
    const old = previous.find(item => item.id === toll.id);
    return old ? { ...toll, ...old } : toll;
  });
  return [...merged, ...previous.filter(toll => toll.id.startsWith('manual:') && !merged.some(item => item.id === toll.id))];
}

export function getTruckRouteKey(draft: TransportQuoteDraft) {
  return JSON.stringify(getRouteStops(draft));
}

export function calculateGoogleRoute(stops: string[]) {
  return new Promise<{ distanceKm: number; path: number[][] }>((resolve, reject) => {
    if (!window.google?.maps?.DirectionsService) {
      reject(new Error('Google Directions is not available'));
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    const origin = stops[0];
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1).map((location) => ({ location, stopover: true }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode?.DRIVING ?? 'DRIVING'
      },
      (result, status) => {
        if (status !== (window.google?.maps?.DirectionsStatus?.OK ?? 'OK') || !result?.routes?.[0]?.legs) {
          reject(new Error(`Directions failed with status ${status}`));
          return;
        }

        if (result.routes[0].legs.length !== stops.length - 1 || result.routes[0].legs.some(leg => !Number.isFinite(leg.distance?.value) || (leg.distance?.value ?? -1) < 0)) { reject(new Error('Incomplete route distance')); return; }
        const meters = result.routes[0].legs.reduce((total, leg) => total + (leg.distance?.value ?? 0), 0);
        const path = result.routes[0].legs.flatMap(leg => (leg.steps ?? []).flatMap(step => (step.path ?? []).map(point => [point.lat(), point.lng()])));
        resolve({ distanceKm: Math.round(meters / 1000), path });
      }
    );
  });
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
  onPrepareQuote: () => void;
  totals: CostTotals;
}) {
  const selectedClient = clients.find((client) => client.id === draft.clientId);
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
  const quoteTariff = calculateTariffFromCost(quoteCost, draft.utilityPercent);
  const [routeStatus, setRouteStatus] = useState('');

  const latestDraft = useRef(draft);
  const latestOnChange = useRef(onDraftChange);
  latestDraft.current = draft;
  latestOnChange.current = onDraftChange;
  const [routeRetry, setRouteRetry] = useState(0);
  const manualDistanceVersion = useRef(0);
  const distanceKey = JSON.stringify(routeStops);
  const previousDistanceKey = useRef(distanceKey);
  const [distanceStatus, setDistanceStatus] = useState('');
  const googleRoute = useRef<{ key: string; distanceKm: number; path: number[][] } | null>(null);

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
    const timeout = window.setTimeout(async () => {
      try {
        setDistanceStatus('Calculando kilómetros con Google…');
        const route = googleRoute.current?.key === distanceKey ? googleRoute.current : await (async () => {
          await loadGooglePlaces();
          return { ...await calculateGoogleRoute(routeStops), key: distanceKey };
        })();
        if (!active || JSON.stringify(getRouteStops(latestDraft.current)) !== distanceKey) return;
        googleRoute.current = route;
        if (version === manualDistanceVersion.current) {
          latestDraft.current = { ...latestDraft.current, distanceKm: route.distanceKm, requiredDays: calculateRequiredDays(route.distanceKm) };
          latestOnChange.current(latestDraft.current);
          setDistanceStatus('Kilómetros estimados con Google · incluye paradas y vuelta. Ruta sin verificar para tránsito pesado.');
        } else setDistanceStatus('Kilómetros editados manualmente. Peajes estimados sobre la ruta de Google.');
        if (route.path.length < 2) throw new Error('Google no devolvió el trazado necesario para estimar peajes.');
        setRouteStatus('Estimando estaciones sobre el trazado de Google…');
        const response = await fetch('/.netlify/functions/route-tolls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ path: route.path })
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.tolls)) throw new Error(result.error || 'No se pudo estimar el listado de peajes.');
        if (!active || JSON.stringify(getRouteStops(latestDraft.current)) !== distanceKey) return;
        latestDraft.current = { ...latestDraft.current, tolls: mergeRouteTolls(result.tolls, latestDraft.current.tolls), tollListStatus: 'pending', tollRouteKey: getTruckRouteKey(latestDraft.current) };
        latestOnChange.current(latestDraft.current);
        setRouteStatus(result.tolls.length + ' paso(s) de peaje estimado(s) sobre la ruta de Google. Revisá nombres, localidades y posibles faltantes antes de confirmar. Mapa: OpenStreetMap, ' + result.catalogDate + '.');
      } catch (error) {
        if (active) {
          if (googleRoute.current?.key !== distanceKey) setDistanceStatus('No se pudo calcular con Google. Podés cargar los kilómetros manualmente.');
          setRouteStatus(error instanceof Error ? error.message : 'No se pudo estimar peajes. Reintentá o agregalos manualmente.');
        }
      }
    }, 700);
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [distanceKey, routeRetry]);

  const [officialRetry, setOfficialRetry] = useState(0);
  const [officialStatus, setOfficialStatus] = useState('');
  const officialLookupKey = JSON.stringify([draft.tollPayment, draft.tolls.map(toll => [toll.id, toll.name, toll.operator, toll.period, toll.direction, toll.payment, toll.source === 'manual' && toll.amount !== null])]);
  useEffect(() => {
    const current = latestDraft.current;
    const candidates = current.tolls.filter(toll => toll.name.trim() && !(toll.source === 'manual' && toll.amount !== null));
    if (!current.tolls.length) { setOfficialStatus('Para buscar precios, primero agregá los peajes del recorrido. La búsqueda de tarifas no detecta estaciones.'); return; }
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
          .filter((item: RouteToll) => item.amount === null && item.lookupMessage)
          .map((item: RouteToll) => item.lookupMessage as string))];
        setOfficialStatus([
          verified ? `${verified} tarifa(s) completada(s) automáticamente.` : '',
          ...pendingReasons
        ].filter(Boolean).join(' ') || 'No se obtuvo ningún importe. Probá actualizar las tarifas.');
      } catch (error) {
        if (active) setOfficialStatus(error instanceof Error ? error.message : 'No se pudo consultar las publicaciones.');
      }
    }, 800);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [officialLookupKey, officialRetry]);

  const updateDraft = <K extends keyof TransportQuoteDraft>(field: K, value: TransportQuoteDraft[K]) => {
    onDraftChange({ ...draft, [field]: value });
  };

  const addAdditional = (id: string) => {
    const definition = additionalCatalog.find(item => item.id === id);
    if (!definition || draft.additionals.some((item) => item.catalogId === id || item.name === definition.name)) {
      return;
    }

    const { name, description, kind } = definition;
    const previousAmount = kind === 'fixed' ? findPreviousAdditionalAmount(previousQuotes, draft.clientId, name) : undefined;
    updateDraft('additionals', [
      ...draft.additionals,
      {
        id: `adicional-${Date.now()}`,
        catalogId: definition.id, description, kind,
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
    tollReady &&
    Boolean(draft.clientId) &&
    draft.distanceKm > 0 &&
    draft.requiredDays > 0 &&
    draft.additionals.every(
      (item) => item.previousAmount === undefined || item.previousAmount === item.amount || item.confirmedDifferentAmount
    );

  return (
    <>
      <header className="topbar quote-topbar">
        <div>
          <h1>Cotizador</h1>
          <p className="page-description">Cada viaje comienza con una cotización bien hecha</p>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumen de cotizacion">
        <Metric label="Cliente" value={selectedClient?.alias || 'Sin cliente'} hint={selectedClient?.businessName || 'Crear o seleccionar cliente'} />
        <Metric label="Kilometros" value={`${draft.distanceKm.toLocaleString('es-AR')} km`} hint={draft.isRoundTrip ? 'Roundtrip' : 'Solo ida'} />
        <Metric label="Dias" value={`${draft.requiredDays}`} hint="800 km cada 24 horas" />
        <Metric label="Costo" value={currency.format(quoteCost)} hint={tollReady ? "Transporte + peajes + adicionales" : "Subtotal: peajes pendientes"} />
        <Metric label="Utilidad" value={`${draft.utilityPercent}%`} hint="Sobre tarifa final" />
        <Metric label="Tarifa" value={tollReady ? currency.format(quoteTariff) : "Pendiente"} hint={tollReady ? "Incluye peajes y utilidad" : "Completar peajes"} />
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
                <option>TECPLATA, La Plata, Buenos Aires, Argentina</option>
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
              Km recorrido
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
              Dias calculados
              <input min="1" type="number" value={draft.requiredDays} onChange={(event) => { manualDistanceVersion.current += 1; updateDraft('requiredDays', Number(event.target.value)); }} />
            </label>
            <label>
              Utilidad %
              <input
                max="99"
                min="0"
                step="0.01"
                type="number"
                value={draft.utilityPercent}
                onChange={(event) => updateDraft('utilityPercent', Number(event.target.value))}
              />
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
          {distanceStatus && <p className="muted-copy route-status" role="status">{distanceStatus}</p>}
          <section className="toll-section" aria-label="Peajes para camión">
            <div className="panel-header">
              <div><p className="eyebrow">Tránsito pesado</p><h2>Peajes del recorrido</h2></div>
              <Truck size={20} />
            </div>
            <p className="muted-copy">Tractor de 3 ejes + araña de 3 ejes · 6 ejes en total. Una fila por cada paso de peaje, incluida la vuelta.</p>
            <div className="form-grid toll-fields">
              <button className="ghost-button" type="button" onClick={() => setRouteRetry(value => value + 1)}>Estimar estaciones con Google</button>
              <button className="ghost-button" type="button" onClick={() => setOfficialRetry(value => value + 1)}>Actualizar tarifas</button>
              <button className="ghost-button" type="button" onClick={() => onDraftChange({ ...draft,
                tolls: [...draft.tolls, { id: 'manual:' + crypto.randomUUID(), name: '', locality: '', road: '', province: '', amount: null, source: 'manual', payment: '' }],
                tollRouteKey: routeKey, tollListStatus: 'pending'
              })}>Agregar peaje</button>
            </div>
            {routeStatus && <p className="muted-copy route-status" role="status">{routeStatus}</p>}
            {draft.tolls.length === 0 && <p className="muted-copy">{draft.tollListStatus === 'pending' ? 'Todavía no se identificaron las estaciones del recorrido. Consultá la ruta o cargá los peajes manualmente.' : 'Recorrido confirmado sin peajes.'}</p>}
            <p className="muted-copy"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Estaciones: © OpenStreetMap contributors (ODbL)</a>. Detección aproximada, editable.</p>
            <p className="muted-copy">El precio se busca automáticamente al completar la forma de pago, el horario y el sentido de cada pasada. Cobertura: estaciones verificadas de AUBASA y AUSOL. No hace falta pulsar Actualizar tarifas.</p>
            <p className="toll-source tariff-lookup-status" role="status">{officialStatus}</p>
            <div className="toll-list">
              {draft.tolls.map((toll, index) => (
                <div className="toll-card" key={toll.id}>
                  <div className="toll-card-heading"><strong>Paso {index + 1}</strong><span>{toll.source === 'official' ? 'Publicación oficial · 6 ejes' : toll.source === 'automatic' ? 'Tarifa estimada · 6 ejes' : toll.amount === null ? 'Importe pendiente' : 'Importe manual'}</span></div>
                  <div className="form-grid">
                    <label>Nombre del peaje<input aria-label={'Nombre del peaje ' + (index + 1)} value={toll.name} placeholder="Completar nombre" onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, name: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))} /></label>
                    <label>Localidad<input aria-label={'Localidad del peaje ' + (index + 1)} value={toll.locality} placeholder="Localidad no informada" onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, locality: event.target.value } : item))} /></label>
                    <label>Importe (ARS)<input aria-label={'Importe del peaje ' + (index + 1)} type="number" min="0" step="0.01" placeholder="Completar tarifa" value={toll.amount ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, amount: event.target.value === '' ? null : Math.max(0, Number(event.target.value)), source: 'manual' } : item))} /></label>
                  </div>
                  <div className="form-grid">
                    <label>Forma de pago en esta estación<select aria-label={'Pago del peaje ' + (index + 1)} value={toll.payment ?? draft.tollPayment} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, payment: event.target.value as NonNullable<RouteToll['payment']>, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Seleccionar</option><option value="tag">TelePASE</option><option value="cash">Efectivo</option>
                    </select></label>
                    <label>Concesionaria<select aria-label={'Concesionaria del peaje ' + (index + 1)} value={toll.operator ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, operator: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Seleccionar</option><option value="aubasa">AUBASA</option><option value="ausol">AUSOL · Acceso Norte</option><option value="other">Otra concesionaria</option>
                    </select></label>
                    <label>Horario del paso<select aria-label={'Horario del peaje ' + (index + 1)} value={toll.period ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, period: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Confirmar</option><option value="normal">No pico</option><option value="peak">Pico</option>
                    </select></label>
                    {toll.operator === 'aubasa' && <label>Sentido del paso<select aria-label={'Sentido del peaje ' + (index + 1)} value={toll.direction ?? ''} onChange={event => updateDraft('tolls', draft.tolls.map(item => item.id === toll.id ? { ...item, direction: event.target.value, amount: null, source: 'pending', sourceUrl: undefined, lookupMessage: undefined } : item))}>
                      <option value="">Confirmar</option><option value="la-plata">CABA → La Plata</option><option value="caba">La Plata → CABA</option><option value="both">Ruta 2 / 11 / 74</option>
                    </select></label>}
                  </div>
                  {toll.stationSourceUrl && <p className="toll-source"><a href={toll.stationSourceUrl} target="_blank" rel="noreferrer">Ver estación en el mapa</a> · Localidad aproximada: revisar</p>}
                  <p className="toll-source">{toll.lookupMessage}</p>
                  {toll.sourceUrl && <p className="toll-source"><a href={toll.sourceUrl} target="_blank" rel="noreferrer">Ver publicación oficial</a> · Categoría {toll.category} · Consultada {toll.checkedAt ? new Date(toll.checkedAt).toLocaleString('es-AR') : ''}{toll.source === 'manual' ? ' · Importe corregido manualmente' : ''}</p>}
                  <div className="toll-card-heading"><small>{[toll.road, toll.province].filter(Boolean).join(' · ')}</small>
                    {<button className="ghost-button" type="button" aria-label={'Quitar peaje ' + (index + 1)} onClick={() => onDraftChange({ ...draft, tolls: draft.tolls.filter(item => item.id !== toll.id), tollListStatus: 'pending' })}>Quitar</button>}
                  </div>
                </div>
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
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Adicionales</p>
              <h2>Adicionales de la cotización</h2>
            </div>
            <Plus size={20} />
          </div>

          <div className="period-controls add-control">
            <label>
              Agregar adicional
              <select defaultValue="" onChange={(event) => { addAdditional(event.target.value); event.target.value = ""; }}>
                <option value="">Seleccionar</option>
                {additionalCatalog.map((item) => (
                  <option key={item.id} value={item.id} disabled={draft.additionals.some(selected => selected.catalogId === item.id || selected.name === item.name)}>{item.name} ({item.kind === "percent" ? "%" : "$"})</option>
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
                    <div><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}<small>Total adicional: {currency.format(calculateAdditionalAmount(item, baseAmount))}</small></div>
                    <label>
                      {item.kind === "percent" ? "% del transporte" : "Importe ($)"}
                      <input aria-label={"Valor de " + item.name} type="number" min="0" step="0.01" value={item.amount} onChange={(event) => updateAdditional(item.id, 'amount', Math.max(0, Number(event.target.value)))} />
                    </label>
                    <label>
                      Bonif. %
                      <input
                        max="100"
                        min="0"
                        type="number"
                        value={item.discountPercent}
                        onChange={(event) => updateAdditional(item.id, 'discountPercent', Math.min(100, Math.max(0, Number(event.target.value))))}
                      />
                    </label>
                    <button className="ghost-button" type="button" aria-label={"Eliminar adicional " + item.name} onClick={() => updateDraft("additionals", draft.additionals.filter(other => other.id !== item.id))}>Eliminar</button>
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
      <div className="quote-submit">
        <button className="primary-button" disabled={!canPrepare} onClick={onPrepareQuote} type="button">
          <FileText size={18} />
          Preparar cotización
        </button>
      </div>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);

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
        onChange={(event) => onChange(event.target.value)}
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
