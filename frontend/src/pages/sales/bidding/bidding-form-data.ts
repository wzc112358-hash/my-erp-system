import dayjs from 'dayjs';

import type { BiddingRecordFormData } from '@/types/bidding-record';
import { extractAttachments } from '@/utils/file';

const formattedDate = (value: unknown, includeTime = false) => {
  if (!value) return undefined;
  const parsed = dayjs.isDayjs(value) ? value : dayjs(String(value));
  return parsed.isValid() ? parsed.format(includeTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD') : undefined;
};

export const biddingSubmissionData = (values: BiddingRecordFormData): BiddingRecordFormData => {
  const cleaned = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  ) as BiddingRecordFormData;
  return {
    ...cleaned,
    tender_fee_date: formattedDate(values.tender_fee_date),
    bid_bond_date: formattedDate(values.bid_bond_date),
    open_date: formattedDate(values.open_date, true),
    bond_return_date: formattedDate(values.bond_return_date),
    tender_fee_invoice: extractAttachments(values.tender_fee_invoice).filter((item): item is File => item instanceof File),
    attachments: extractAttachments(values.attachments),
  };
};
