import { pb } from '@/lib/pocketbase';

export type InvoiceVerificationCollection = 'sale_invoices' | 'purchase_invoices';
export type InvoiceVerificationStatus = 'yes' | 'no';

export interface InvoiceVerificationResult {
  id: string;
  is_verified: InvoiceVerificationStatus;
}

export const InvoiceVerificationAPI = {
  update: (
    collection: InvoiceVerificationCollection,
    recordId: string,
    status: InvoiceVerificationStatus,
  ) => pb.collection(collection).update<InvoiceVerificationResult>(recordId, {
    is_verified: status,
  }),
};
