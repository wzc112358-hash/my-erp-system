export interface InvoiceManagerState {
  manager_confirmed?: string;
  is_verified?: string;
}

export const invoiceNeedsManagerAction = (invoice: InvoiceManagerState): boolean => (
  invoice.manager_confirmed === 'pending' || invoice.is_verified !== 'yes'
);
