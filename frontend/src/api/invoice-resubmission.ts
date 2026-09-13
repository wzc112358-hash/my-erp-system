import { pb } from '@/lib/pocketbase';

export type InvoiceReviewCollection = 'sale_invoices' | 'purchase_invoices';

export interface InvoiceResubmissionResult {
  collection: InvoiceReviewCollection;
  recordId: string;
  status: 'pending';
  changed: boolean;
}

export const InvoiceResubmissionAPI = {
  submit: (collection: InvoiceReviewCollection, recordId: string) =>
    pb.send<InvoiceResubmissionResult>('/api/erp/invoice-resubmissions', {
      method: 'POST',
      body: { collection, recordId },
    }),
};
