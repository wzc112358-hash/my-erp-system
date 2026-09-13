export type InvoiceReviewCollection = 'sale_invoices' | 'purchase_invoices';

export const isInvoiceReviewCollection = (value?: string): value is InvoiceReviewCollection =>
  value === 'sale_invoices' || value === 'purchase_invoices';

export const invoiceReviewEditPath = (collection: InvoiceReviewCollection, recordId: string) => {
  const basePath = collection === 'sale_invoices' ? '/sales/invoices' : '/purchase/invoices';
  return `${basePath}?edit=${encodeURIComponent(recordId)}`;
};
