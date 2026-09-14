export type DealStage = 'nuevo' | 'contactado' | 'cotizando' | 'ganado';

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: 'Activo' | 'Potencial' | 'Dormido';
  value: number;
};

export type Deal = {
  id: string;
  customerId: string;
  title: string;
  stage: DealStage;
  amount: number;
  nextStep: string;
};

export type QuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type Quote = {
  id: string;
  customerId: string;
  validUntil: string;
  discountPercent: number;
  taxPercent: number;
  items: QuoteItem[];
};
