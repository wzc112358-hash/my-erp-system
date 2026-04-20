export interface ExpenseRecord {
  id: string;
  no: string;
  expense_type: string;
  description: string;
  payment_amount: number;
  pay_date: string;
  method?: string;
  remark?: string;
  attachments?: string[];
  purchasing_manager?: string;
  creator_user?: string;
  created: string;
  updated: string;
  expand?: {
    creator_user?: { id: string; name: string };
  };
}

export interface ExpenseRecordFormData {
  no: string;
  expense_type: string;
  description: string;
  payment_amount?: number;
  pay_date: string;
  method?: string;
  remark?: string;
  attachments?: (File | string)[];
  purchasing_manager?: string;
}

export interface ExpenseRecordListParams {
  page?: number;
  per_page?: number;
  search?: string;
}
