import { pb } from '@/lib/pocketbase';

export type RecycleCollection =
  | 'sales_contracts'
  | 'purchase_contracts'
  | 'sales_shipments'
  | 'sale_invoices'
  | 'sale_receipts'
  | 'purchase_arrivals'
  | 'purchase_invoices'
  | 'purchase_payments';

export interface RecycleBinItem {
  batchId: string;
  rootCollection: RecycleCollection;
  rootRecordId: string;
  contractType: 'sales' | 'purchase';
  recordNo: string;
  productName: string;
  deletedAt: string;
  deletedBy: string;
  deletedByName: string;
  recordCount: number;
  attachmentCount: number;
  childCounts: Partial<Record<RecycleCollection, number>>;
}

export interface OperationLog {
  id: string;
  operation: string;
  contract_type: string;
  operator_id: string;
  operator_name: string;
  operator_role: string;
  source_contract_id: string;
  source_contract_no: string;
  target_contract_no: string;
  collection_name: string;
  record_id: string;
  record_snapshot: string;
  result: string;
  error_message: string;
  delete_batch_id: string;
  details: string;
  created: string;
}

export interface OperationLogFilters {
  contractType?: 'sales' | 'purchase' | 'sales_purchase';
  collectionName?: RecycleCollection;
  operation?: string;
  result?: 'success' | 'failed';
  search?: string;
}

interface AuditUser {
  id: string;
  user_name?: string;
  name?: string;
  email?: string;
}

const loadAuditUsers = async (): Promise<AuditUser[]> => {
  try {
    return await pb.collection('users').getFullList<AuditUser>({ sort: 'name' });
  } catch {
    // Logs remain usable even if user lookup is temporarily unavailable.
    return [];
  }
};

const buildLogFilter = (
  filters: OperationLogFilters,
  users: AuditUser[],
): string | undefined => {
  const clauses: string[] = [];
  if (filters.contractType) {
    clauses.push(pb.filter('contract_type = {:contractType}', { contractType: filters.contractType }));
  }
  if (filters.collectionName) {
    clauses.push(pb.filter('collection_name = {:collectionName}', { collectionName: filters.collectionName }));
  }
  if (filters.operation) {
    clauses.push(pb.filter('operation = {:operation}', { operation: filters.operation }));
  }
  if (filters.result) {
    clauses.push(pb.filter('result = {:result}', { result: filters.result }));
  }

  const search = filters.search?.trim();
  if (search) {
    const matchingUserIds = users
      .filter((user) => (user.user_name || user.name || user.email || '').toLocaleLowerCase().includes(search.toLocaleLowerCase()))
      .map((user) => user.id);
    const params: Record<string, string> = { search };
    const operatorClauses = matchingUserIds.map((id, index) => {
      const key = `operator${index}`;
      params[key] = id;
      return `operator_id = {:${key}}`;
    });
    clauses.push(pb.filter(
      `(source_contract_no ~ {:search} || target_contract_no ~ {:search} || record_id ~ {:search} || operator_name ~ {:search}${operatorClauses.length ? ` || ${operatorClauses.join(' || ')}` : ''})`,
      params,
    ));
  }
  return clauses.length ? clauses.join(' && ') : undefined;
};

export const RecycleBinAPI = {
  remove: (collection: RecycleCollection, recordId: string) => (
    pb.send<{ success: boolean; batchId: string }>('/api/erp/recycle/delete', {
      method: 'POST',
      body: { collection, recordId },
    })
  ),

  list: async () => {
    const response = await pb.send<{ items: RecycleBinItem[] }>('/api/erp/recycle/list', {
      method: 'POST',
    });
    return response.items;
  },

  restore: (batchId: string) => (
    pb.send<{ success: boolean }>('/api/erp/recycle/restore', {
      method: 'POST',
      body: { batchId },
    })
  ),

  listLogs: async (page: number, perPage: number, filters: OperationLogFilters = {}) => {
    const users = await loadAuditUsers();
    const result = await pb.collection('contract_operation_logs').getList<OperationLog>(page, perPage, {
      sort: '-created',
      filter: buildLogFilter(filters, users),
    });
    const names = new Map(users.map((user) => [
      user.id,
      user.user_name || user.name || user.email || '未知用户',
    ]));
    return {
      ...result,
      items: result.items.map((log) => ({
        ...log,
        operator_name: names.get(log.operator_id) || log.operator_name || (log.operator_id ? '未知用户' : '系统'),
      })),
    };
  },
};
