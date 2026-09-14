import type { Customer, Deal, Quote } from './types';

export const customers: Customer[] = [
  {
    id: 'cus_01',
    name: 'Mariana Costa',
    company: 'Andes Logistica',
    email: 'mariana@andeslogistica.com',
    phone: '+54 11 5555 2100',
    status: 'Activo',
    value: 148000
  },
  {
    id: 'cus_02',
    name: 'Pablo Rivero',
    company: 'Puerto Norte SA',
    email: 'pablo@puertonorte.com',
    phone: '+54 221 444 8820',
    status: 'Potencial',
    value: 92000
  },
  {
    id: 'cus_03',
    name: 'Lucia Mendez',
    company: 'Frio Sur',
    email: 'lucia@friosur.com',
    phone: '+54 2901 621 440',
    status: 'Activo',
    value: 215000
  }
];

export const deals: Deal[] = [
  {
    id: 'deal_01',
    customerId: 'cus_01',
    title: 'Renovacion operativa Q4',
    stage: 'cotizando',
    amount: 72000,
    nextStep: 'Enviar version final'
  },
  {
    id: 'deal_02',
    customerId: 'cus_02',
    title: 'Servicio integral inicial',
    stage: 'contactado',
    amount: 38000,
    nextStep: 'Agendar reunion'
  },
  {
    id: 'deal_03',
    customerId: 'cus_03',
    title: 'Ampliacion de cobertura',
    stage: 'ganado',
    amount: 118000,
    nextStep: 'Preparar onboarding'
  },
  {
    id: 'deal_04',
    customerId: 'cus_02',
    title: 'Consulta spot',
    stage: 'nuevo',
    amount: 12500,
    nextStep: 'Calificar necesidad'
  }
];

export const quote: Quote = {
  id: 'quo_01',
  customerId: 'cus_01',
  validUntil: '2026-10-15',
  discountPercent: 5,
  taxPercent: 21,
  items: [
    {
      id: 'item_01',
      description: 'Servicio base mensual',
      quantity: 1,
      unitPrice: 42000
    },
    {
      id: 'item_02',
      description: 'Gestion documental',
      quantity: 3,
      unitPrice: 8500
    },
    {
      id: 'item_03',
      description: 'Soporte prioritario',
      quantity: 1,
      unitPrice: 14500
    }
  ]
};
