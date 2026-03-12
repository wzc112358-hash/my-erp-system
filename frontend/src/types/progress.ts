import type { SalesContract } from './sales-contract';
import type { PurchaseContract } from './purchase-contract';
import type { SalesShipment, SaleInvoice, SaleReceipt } from './sales-contract';
import type { PurchaseArrival, PurchaseInvoice, PurchasePayment } from './purchase-contract';

export type {
  SalesContract,
  PurchaseContract,
  SalesShipment,
  SaleInvoice,
  SaleReceipt,
  PurchaseArrival,
  PurchaseInvoice,
  PurchasePayment,
};

export interface ContractListParams {
  page?: number;
  per_page?: number;
  status?: string;
  keyword?: string;
}

export interface ContractProgressItem {
  id: string;
  no: string;
  product_name: string;
  sign_date: string;
  total_amount: number;
  total_quantity: number;
  status: 'executing' | 'completed' | 'cancelled';
}

export interface SalesProgressItem extends ContractProgressItem {
  type: 'sales';
  customer_name: string;
  executed_quantity: number;
  execution_percent: number;
  receipted_amount: number;
  receipt_percent: number;
  invoiced_amount: number;
  invoice_percent: number;
}

export interface PurchaseProgressItem extends ContractProgressItem {
  type: 'purchase';
  supplier_name: string;
  sales_contract_no: string;
  executed_quantity: number;
  execution_percent: number;
  invoiced_amount: number;
  invoiced_percent: number;
  paid_amount: number;
  paid_percent: number;
}

export type ProgressItem = SalesProgressItem | PurchaseProgressItem;

export interface SalesContractDetail {
  contract: SalesContract;
  shipments: SalesShipment[];
  invoices: SaleInvoice[];
  receipts: SaleReceipt[];
}

export interface PurchaseContractDetail {
  contract: PurchaseContract;
  arrivals: PurchaseArrival[];
  invoices: PurchaseInvoice[];
  payments: PurchasePayment[];
}
