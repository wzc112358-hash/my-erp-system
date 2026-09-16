import { pb } from '@/lib/pocketbase';

export type InvoiceVerificationCollection = 'purchase_invoices';
export type InvoiceVerificationStatus = 'yes' | 'no';

export interface InvoiceVerificationResult {
  recordId: string;
  status: InvoiceVerificationStatus;
  managerConfirmed: string;
  changed: boolean;
}

export const InvoiceVerificationAPI = {
  update: (
    recordId: string,
    status: InvoiceVerificationStatus,
  ) => pb.send<InvoiceVerificationResult>('/api/erp/purchase-invoice-verifications', {
    method: 'POST',
    body: { recordId, status },
  }),
};
