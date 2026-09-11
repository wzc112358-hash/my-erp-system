import { pb } from '@/lib/pocketbase';

export type ContractOperationType = 'sales' | 'purchase';

export const ContractOperationsAPI = {
  unlink: (salesId: string, purchaseId: string) => (
    pb.send<{ success: boolean }>('/api/erp/contracts/unlink', {
      method: 'POST',
      body: { salesId, purchaseId },
    })
  ),

  removeFromDeal: (type: ContractOperationType, contractId: string) => (
    pb.send<{ success: boolean }>('/api/erp/business-deals/remove-contract', {
      method: 'POST',
      body: { type, contractId },
    })
  ),

  unlinkAndDelete: (type: ContractOperationType, contractId: string) => (
    pb.send<{ success: boolean }>('/api/erp/contracts/unlink-delete', {
      method: 'POST',
      body: { type, contractId },
    })
  ),
};
