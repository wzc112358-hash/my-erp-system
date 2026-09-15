export interface InvoiceManagerState {
  manager_confirmed?: string;
  is_verified?: string;
}

export interface PurchaseInvoiceVerificationState {
  purchase_contract?: string;
  amount?: number;
  is_verified?: string;
}

export interface UnverifiedInvoiceSummary {
  count: number;
  amount: number;
}

export const invoiceNeedsManagerAction = (
  invoice: InvoiceManagerState,
  verificationRequired: boolean,
): boolean => (
  invoice.manager_confirmed === 'pending'
  || (verificationRequired && invoice.is_verified !== 'yes')
);

export const summarizeUnverifiedPurchaseInvoices = (
  invoices: PurchaseInvoiceVerificationState[],
): Map<string, UnverifiedInvoiceSummary> => {
  const summaries = new Map<string, UnverifiedInvoiceSummary>();
  invoices.forEach((invoice) => {
    if (!invoice.purchase_contract || invoice.is_verified === 'yes') return;
    const current = summaries.get(invoice.purchase_contract) || { count: 0, amount: 0 };
    summaries.set(invoice.purchase_contract, {
      count: current.count + 1,
      amount: current.amount + (Number(invoice.amount) || 0),
    });
  });
  return summaries;
};
