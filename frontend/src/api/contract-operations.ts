import { pb } from '@/lib/pocketbase';

export type ContractOperationType = 'sales' | 'purchase';

export const ContractOperationsAPI = {
  unlink: (salesId: string, purchaseId: string) => (
    pb.send<{ success: boolean }>('/api/erp/contracts/unlink', {
      method: 'POST',
      body: { salesId, purchaseId },
    })
  ),

  unlinkAndDelete: (type: ContractOperationType, contractId: string) => (
    pb.send<{ success: boolean }>('/api/erp/contracts/unlink-delete', {
      method: 'POST',
      body: { type, contractId },
    })
  ),
};
