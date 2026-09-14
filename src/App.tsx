import { useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  LayoutDashboard,
  Plus,
  Search,
  Send,
  Smartphone,
  Users
} from 'lucide-react';
import { customers, deals, quote as initialQuote } from './data';
import { isSupabaseConfigured } from './supabase';
import type { DealStage, QuoteItem } from './types';

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});

const stages: Array<{ id: DealStage; label: string }> = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'contactado', label: 'Contactado' },
  { id: 'cotizando', label: 'Cotizando' },
  { id: 'ganado', label: 'Ganado' }
];

function App() {
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialQuote.customerId);
  const [items, setItems] = useState<QuoteItem[]>(initialQuote.items);
  const [discountPercent, setDiscountPercent] = useState(initialQuote.discountPercent);
  const [taxPercent, setTaxPercent] = useState(initialQuote.taxPercent);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0];

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = subtotal * (discountPercent / 100);
    const taxable = subtotal - discount;
    const taxes = taxable * (taxPercent / 100);
    return {
      subtotal,
      discount,
      taxes,
      total: taxable + taxes
    };
  }, [discountPercent, items, taxPercent]);

  const updateItem = (id: string, field: keyof QuoteItem, value: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          [field]: field === 'description' ? value : Number(value)
        };
      })
    );
  };

  const addItem = () => {
    setItems((currentItems) => [
      ...currentItems,
      {
        id: `item_${Date.now()}`,
        description: 'Nuevo concepto',
        quantity: 1,
        unitPrice: 0
      }
    ]);
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
          <button className="nav-item active" type="button">
            <LayoutDashboard size={18} />
            Panel
          </button>
          <button className="nav-item" type="button">
            <Users size={18} />
            Clientes
          </button>
          <button className="nav-item" type="button">
            <BriefcaseBusiness size={18} />
            Oportunidades
          </button>
          <button className="nav-item" type="button">
            <CircleDollarSign size={18} />
            Cotizador
          </button>
        </nav>

        <div className="sync-panel">
          <Smartphone size={18} />
          <div>
            <strong>{isSupabaseConfigured ? 'Supabase conectado' : 'Supabase pendiente'}</strong>
            <span>{isSupabaseConfigured ? 'Listo para persistir datos' : 'Configurar variables .env'}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Pipeline comercial</p>
            <h1>CRM con cotizador integrado</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={18} />
              <input placeholder="Buscar cliente, empresa o oportunidad" />
            </label>
            <button className="icon-button" type="button" aria-label="Descargar cotizacion">
              <Download size={19} />
            </button>
            <button className="primary-button" type="button">
              <Send size={18} />
              Enviar cotizacion
            </button>
          </div>
        </header>

        <section className="metric-grid" aria-label="Metricas">
          <Metric label="Clientes activos" value={customers.length.toString()} hint="+2 este mes" />
          <Metric label="Pipeline abierto" value={currency.format(deals.reduce((sum, deal) => sum + deal.amount, 0))} hint="4 oportunidades" />
          <Metric label="Cotizacion actual" value={currency.format(totals.total)} hint="IVA incluido" />
          <Metric label="Tasa estimada" value="64%" hint="conversion ponderada" />
        </section>

        <section className="content-grid">
          <div className="panel pipeline-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Oportunidades</p>
                <h2>Pipeline</h2>
              </div>
              <button className="ghost-button" type="button">
                <Plus size={17} />
                Nueva
              </button>
            </div>

            <div className="stage-grid">
              {stages.map((stage) => (
                <div className="stage-column" key={stage.id}>
                  <div className="stage-title">
                    <span>{stage.label}</span>
                    <strong>{deals.filter((deal) => deal.stage === stage.id).length}</strong>
                  </div>
                  {deals
                    .filter((deal) => deal.stage === stage.id)
                    .map((deal) => {
                      const customer = customers.find((item) => item.id === deal.customerId);

                      return (
                        <article className="deal-card" key={deal.id}>
                          <span>{customer?.company}</span>
                          <h3>{deal.title}</h3>
                          <div className="deal-footer">
                            <strong>{currency.format(deal.amount)}</strong>
                            <small>{deal.nextStep}</small>
                          </div>
                        </article>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>

          <div className="panel customer-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Cuentas</p>
                <h2>Clientes</h2>
              </div>
            </div>

            <div className="customer-list">
              {customers.map((customer) => (
                <button
                  className={`customer-row ${customer.id === selectedCustomerId ? 'selected' : ''}`}
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  type="button"
                >
                  <span className="avatar">{customer.company.slice(0, 2).toUpperCase()}</span>
                  <span>
                    <strong>{customer.company}</strong>
                    <small>{customer.name}</small>
                  </span>
                  <em>{customer.status}</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel quote-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cotizador</p>
              <h2>{selectedCustomer.company}</h2>
            </div>
            <div className="quote-meta">
              <CalendarDays size={17} />
              Valida hasta {new Date(initialQuote.validUntil).toLocaleDateString('es-AR')}
            </div>
          </div>

          <div className="quote-layout">
            <div className="quote-table">
              <div className="quote-row quote-head">
                <span>Concepto</span>
                <span>Cantidad</span>
                <span>Precio</span>
                <span>Total</span>
              </div>
              {items.map((item) => (
                <div className="quote-row" key={item.id}>
                  <input value={item.description} onChange={(event) => updateItem(item.id, 'description', event.target.value)} />
                  <input min="0" type="number" value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} />
                  <input min="0" type="number" value={item.unitPrice} onChange={(event) => updateItem(item.id, 'unitPrice', event.target.value)} />
                  <strong>{currency.format(item.quantity * item.unitPrice)}</strong>
                </div>
              ))}
              <button className="ghost-button add-line" onClick={addItem} type="button">
                <Plus size={17} />
                Agregar item
              </button>
            </div>

            <aside className="totals-panel">
              <label>
                Descuento %
                <input min="0" max="100" type="number" value={discountPercent} onChange={(event) => setDiscountPercent(Number(event.target.value))} />
              </label>
              <label>
                Impuesto %
                <input min="0" type="number" value={taxPercent} onChange={(event) => setTaxPercent(Number(event.target.value))} />
              </label>
              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{currency.format(totals.subtotal)}</dd>
                </div>
                <div>
                  <dt>Descuento</dt>
                  <dd>-{currency.format(totals.discount)}</dd>
                </div>
                <div>
                  <dt>Impuestos</dt>
                  <dd>{currency.format(totals.taxes)}</dd>
                </div>
                <div className="grand-total">
                  <dt>Total</dt>
                  <dd>{currency.format(totals.total)}</dd>
                </div>
              </dl>
              <button className="primary-button wide" type="button">
                <CheckCircle2 size={18} />
                Aprobar y guardar
              </button>
            </aside>
          </div>
        </section>
      </section>
    </main>
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
