import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Tabs, Table, Descriptions, Button, Tag, Spin, App, Alert, Upload, Empty, Popconfirm, Select, Space } from 'antd';
import { CheckOutlined, CloseOutlined, LeftOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { ComparisonAPI } from '@/api/comparison';
import { getPbErrorMessage } from '@/api/helpers';
import { ManagerConfirmationAPI } from '@/api/manager-confirmation';
import type { ManagerConfirmableCollection, ManagerConfirmationDecision } from '@/api/manager-confirmation';
import { InvoiceVerificationAPI } from '@/api/invoice-verification';
import type { InvoiceVerificationCollection, InvoiceVerificationStatus } from '@/api/invoice-verification';
import { assertAttachmentFileSize } from '@/utils/file';
import { BiddingRecordAPI } from '@/api/bidding-record';
import { pb } from '@/lib/pocketbase';
import { RecycleBinAPI } from '@/api/recycle-bin';
import type { RecycleCollection } from '@/api/recycle-bin';
import { getUsdToCnyRate, formatCrossBorderAmount, formatFreightAmount } from '@/lib/exchange-rate';
import { calculateBusinessDealProfit, DEFAULT_PROFIT_TAX_RATE } from '@/lib/contract-profit';
import type { ContractDetailData, PurchaseArrivalRecord, PurchaseInvoiceRecord, PurchasePaymentRecord, SaleInvoiceRecord } from '@/types/comparison';
import type { BiddingRecord } from '@/types/bidding-record';
import { useManagerPendingStore } from '@/stores/manager-pending';
import dayjs from 'dayjs';

const formatCurrency = (value: number) => `¥${(value ?? 0).toFixed(6)}`;
const formatUSD = (value: number) => `$${(value ?? 0).toFixed(6)}`;
const formatDate = (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-';
const percentFormat = (value: number) => `${value.toFixed(2)}%`;
const responsiveDescriptionColumns = { xs: 1, sm: 2, lg: 4 } as const;

interface ProfitCalc {
  operatingProfit: number;
  taxAmount: number;
  netProfit: number;
  salesAmountIncTax: number;
  purchaseAmountIncTax: number;
  salesAmountExTax: number;
  purchaseAmountExTax: number;
  totalFreight: number;
  totalMiscellaneous: number;
  quantityMatched: boolean;
  salesReceivableAmount: number;
  purchasePaidAmount: number;
  currentProfit: number;
  currentProfitTax: number;
  currentProfitNet: number;
  minQty: number;
  salesQty: number;
  purchaseQty: number;
  // 已执行利润（按各自实际执行量）
  realizedSalesQty: number;
  realizedPurchaseQty: number;
  realizedSalesAmount: number;
  realizedPurchaseAmount: number;
  realizedFreight: number;
  realizedMiscellaneous: number;
  realizedOperatingProfit: number;
  realizedTax: number;
  realizedNetProfit: number;
}

// 读取后端已按 CNY 口径算好的「已执行利润」字段（带默认 0）
const readRealizedCNY = (data: ContractDetailData) => {
  const p = data.profit;
  return {
    realizedSalesQty: p.realized_sales_quantity ?? 0,
    realizedPurchaseQty: p.realized_purchase_quantity ?? 0,
    realizedSalesAmount: p.realized_sales_amount ?? 0,
    realizedPurchaseAmount: p.realized_purchase_amount ?? 0,
    realizedFreight: p.realized_freight ?? 0,
    realizedMiscellaneous: p.realized_miscellaneous ?? 0,
    realizedOperatingProfit: p.realized_operating_profit ?? 0,
    realizedTax: p.realized_tax ?? 0,
    realizedNetProfit: p.realized_net_profit ?? 0,
  };
};

// USD 面板：已执行利润字段除以汇率
const readRealizedUSD = (data: ContractDetailData, rate: number) => {
  const r = readRealizedCNY(data);
  if (rate <= 0) return r;
  return {
    realizedSalesQty: r.realizedSalesQty,
    realizedPurchaseQty: r.realizedPurchaseQty,
    realizedSalesAmount: r.realizedSalesAmount / rate,
    realizedPurchaseAmount: r.realizedPurchaseAmount / rate,
    realizedFreight: r.realizedFreight / rate,
    realizedMiscellaneous: r.realizedMiscellaneous / rate,
    realizedOperatingProfit: r.realizedOperatingProfit / rate,
    realizedTax: r.realizedTax / rate,
    realizedNetProfit: r.realizedNetProfit / rate,
  };
};

const calcProfitCNY = (data: ContractDetailData, rate: number): ProfitCalc => {
  const salesContracts = data.sales_contracts?.length
    ? data.sales_contracts
    : (data.sales_contract ? [data.sales_contract] : []);
  const salesReceivableAmount = salesContracts.reduce((sum, contract) => (
    sum + contract.executed_quantity * contract.unit_price * (contract.is_cross_border ? rate : 1)
  ), 0);
  const paidAmount = (data.purchase_payments || []).reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  const salesQty = salesContracts.reduce((sum, contract) => sum + contract.total_quantity, 0);
  const purchaseQty = data.purchase_contracts.reduce((sum, pc) => sum + pc.total_quantity, 0);
  const minQty = Math.min(salesQty, purchaseQty);
  const realized = readRealizedCNY(data);
  const salesAmounts = salesContracts.reduce((totals, contract) => {
    const amount = contract.total_amount * (contract.is_cross_border ? rate : 1);
    totals.incTax += contract.is_price_excluding_tax ? amount * 1.13 : amount;
    totals.exTax += contract.is_price_excluding_tax ? amount : amount / 1.13;
    return totals;
  }, { incTax: 0, exTax: 0 });
  const purchaseTotalAmountCny = data.purchase_contracts.reduce((sum, pc) => {
    const amountCny = pc.is_cross_border ? pc.total_amount * rate : pc.total_amount;
    return sum + amountCny;
  }, 0);
  const freightCny = data.profit.total_freight;
  const miscCny = data.profit.total_miscellaneous;
  const totalTariff = data.profit.total_tariff ?? data.purchase_arrivals.reduce((sum, arrival) => sum + (arrival.tariff || 0), 0);
  const totalVAT = data.profit.total_value_added_tax ?? data.purchase_arrivals.reduce((sum, arrival) => sum + (arrival.value_added_tax || 0), 0);
  const profit = calculateBusinessDealProfit({
    salesAmountIncTax: salesAmounts.incTax,
    salesAmountExTax: salesAmounts.exTax,
    purchaseAmountIncTax: purchaseTotalAmountCny,
    freight: freightCny,
    miscellaneous: miscCny,
    tariff: totalTariff,
    valueAddedTax: totalVAT,
    taxRate: data.profit.tax_rate ?? DEFAULT_PROFIT_TAX_RATE,
  });
  const currentProfit = realized.realizedNetProfit;

  return {
    operatingProfit: profit.operatingProfit,
    taxAmount: profit.taxAmount,
    netProfit: profit.netProfit,
    salesAmountIncTax: profit.salesAmountIncTax,
    purchaseAmountIncTax: profit.purchaseAmountIncTax,
    salesAmountExTax: profit.salesAmountExTax,
    purchaseAmountExTax: profit.purchaseAmountExTax,
    totalFreight: freightCny,
    totalMiscellaneous: miscCny,
    quantityMatched: data.profit.is_quantity_matched,
    salesReceivableAmount,
    purchasePaidAmount: paidAmount,
    currentProfit, currentProfitTax: 0, currentProfitNet: 0,
    minQty, salesQty, purchaseQty,
    ...realized,
  };
};

const calcProfitUSD = (data: ContractDetailData, rate: number): ProfitCalc => {
  const cny = calcProfitCNY(data, rate);
  const divisor = rate > 0 ? rate : 1;
  return {
    ...cny,
    operatingProfit: cny.operatingProfit / divisor,
    taxAmount: cny.taxAmount / divisor,
    netProfit: cny.netProfit / divisor,
    salesAmountIncTax: cny.salesAmountIncTax / divisor,
    purchaseAmountIncTax: cny.purchaseAmountIncTax / divisor,
    salesAmountExTax: cny.salesAmountExTax / divisor,
    purchaseAmountExTax: cny.purchaseAmountExTax / divisor,
    totalFreight: cny.totalFreight / divisor,
    totalMiscellaneous: cny.totalMiscellaneous / divisor,
    salesReceivableAmount: cny.salesReceivableAmount / divisor,
    purchasePaidAmount: cny.purchasePaidAmount / divisor,
    currentProfit: cny.currentProfit / divisor,
    ...readRealizedUSD(data, divisor),
  };
};

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待确认', color: 'orange' },
    approved: { text: '已确认', color: 'green' },
    rejected: { text: '已驳回', color: 'red' },
  };
  const info = statusMap[status] || { text: '-', color: 'default' };
  return <Tag color={info.color}>{info.text}</Tag>;
};

const ContractDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const isStandalonePurchase = location.pathname.includes('/overview/purchase/');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(isStandalonePurchase ? 'purchase' : 'sales');
  const [detailData, setDetailData] = useState<ContractDetailData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verificationUpdating, setVerificationUpdating] = useState<string>();
  const [confirmationUpdating, setConfirmationUpdating] = useState<{
    key: string;
    decision: ManagerConfirmationDecision;
  }>();
  const [biddingRecords, setBiddingRecords] = useState<BiddingRecord[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(7.25);
  const { fetchPendingCount } = useManagerPendingStore();

  useEffect(() => { getUsdToCnyRate().then(setExchangeRate); }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        let data: ContractDetailData;
        if (isStandalonePurchase) {
          data = await ComparisonAPI.getPurchaseContractDetail(id);
        } else {
          data = await ComparisonAPI.getContractDetail(id);
        }
        if (!cancelled) {
          setDetailData(data);
          if (data.sales_contracts?.length) {
            try {
              const biddingResults = await Promise.all(
                data.sales_contracts.map((contract) => BiddingRecordAPI.getBySalesContract(contract.id)),
              );
              if (!cancelled) {
                setBiddingRecords(biddingResults.flatMap((result) => result.items));
              }
            } catch {
              // bidding records are optional
            }
          }
        }
      } catch (error) {
        const err = error as { name?: string; message?: string; cause?: { name?: string } };
        const isAborted = err.name === 'AbortError' || err.name === 'CanceledError' || err.message?.includes('aborted') || err.cause?.name === 'AbortError';
        if (!cancelled && !isAborted) {
          console.error('加载合同详情失败:', error);
          message.error('加载合同详情失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [id, message, isStandalonePurchase]);

  const handleAttachmentUpload = useCallback(async (collection: string, recordId: string, file: File) => {
    setUploading(true);
    try {
      assertAttachmentFileSize([file]);
      const formData = new FormData();
      formData.append('attachments', file);
      await pb.collection(collection).update(recordId, formData);
      if (id) {
        const data = isStandalonePurchase
          ? await ComparisonAPI.getPurchaseContractDetail(id)
          : await ComparisonAPI.getContractDetail(id);
        setDetailData(data);
      }
      message.success('附件上传成功');
    } catch (err) {
      message.error(getPbErrorMessage(err, '附件上传失败'));
    } finally {
      setUploading(false);
    }
  }, [id, message, isStandalonePurchase]);

  const handleVerificationChange = useCallback(async (
    collection: InvoiceVerificationCollection,
    recordId: string,
    value: InvoiceVerificationStatus,
  ) => {
    const key = `${collection}:${recordId}`;
    setVerificationUpdating(key);
    try {
      await InvoiceVerificationAPI.update(collection, recordId, value);
      if (id) {
        const data = isStandalonePurchase
          ? await ComparisonAPI.getPurchaseContractDetail(id)
          : await ComparisonAPI.getContractDetail(id);
        setDetailData(data);
      }
      message.success('验票状态已更新');
    } catch (error) {
      message.error(getPbErrorMessage(error, '验票状态更新失败'));
    } finally {
      setVerificationUpdating(undefined);
    }
  }, [id, isStandalonePurchase, message]);

  const invoiceVerificationColumn = (collection: InvoiceVerificationCollection) => ({
    title: '验票状态',
    dataIndex: 'is_verified',
    key: 'is_verified',
    width: 110,
    render: (value: string, record: { id: string }) => {
      const key = `${collection}:${record.id}`;
      return (
        <Select
          size="small"
          value={value === 'yes' ? 'yes' : 'no'}
          options={[
            { label: '已验票', value: 'yes' },
            { label: '未验票', value: 'no' },
          ]}
          loading={verificationUpdating === key}
          disabled={verificationUpdating !== undefined}
          onChange={(nextValue: InvoiceVerificationStatus) => handleVerificationChange(collection, record.id, nextValue)}
          style={{ width: 92 }}
          aria-label="验票状态"
        />
      );
    },
  });

  const handleManagerDecision = useCallback(async (
    collection: ManagerConfirmableCollection,
    recordId: string,
    decision: ManagerConfirmationDecision,
  ) => {
    const key = `${collection}:${recordId}`;
    setConfirmationUpdating({ key, decision });
    try {
      await ManagerConfirmationAPI.submit(collection, recordId, decision);
      if (id) {
        const data = isStandalonePurchase
          ? await ComparisonAPI.getPurchaseContractDetail(id)
          : await ComparisonAPI.getContractDetail(id);
        setDetailData(data);
      }
      await fetchPendingCount();
      message.success(decision === 'approved' ? '确认成功' : '已驳回');
    } catch (error) {
      message.error(getPbErrorMessage(error, decision === 'approved' ? '确认失败，请重试' : '驳回失败，请重试'));
    } finally {
      setConfirmationUpdating(undefined);
    }
  }, [fetchPendingCount, id, isStandalonePurchase, message]);

  const managerConfirmationColumn = (collection: ManagerConfirmableCollection) => ({
    title: '管理确认状态',
    dataIndex: 'manager_confirmed',
    key: 'manager_confirmed',
    width: 220,
    render: (status: string, record: { id: string }) => {
      if (status !== 'pending') return <StatusTag status={status} />;

      const key = `${collection}:${record.id}`;
      const updatingThisRecord = confirmationUpdating?.key === key;
      return (
        <Space size={4} wrap={false}>
          <StatusTag status={status} />
          <Popconfirm
            title="确认这条记录？"
            description="提交后会写入管理确认日志。"
            okText="确认"
            cancelText="取消"
            onConfirm={() => handleManagerDecision(collection, record.id, 'approved')}
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={updatingThisRecord && confirmationUpdating?.decision === 'approved'}
              disabled={updatingThisRecord}
            >
              确认
            </Button>
          </Popconfirm>
          <Popconfirm
            title="驳回这条记录？"
            description="员工可根据反馈修改后重新提交。"
            okText="驳回"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleManagerDecision(collection, record.id, 'rejected')}
          >
            <Button
              danger
              size="small"
              icon={<CloseOutlined />}
              loading={updatingThisRecord && confirmationUpdating?.decision === 'rejected'}
              disabled={updatingThisRecord}
            >
              驳回
            </Button>
          </Popconfirm>
        </Space>
      );
    },
  });

  const salesColumns = [
    { title: '所属销售合同', dataIndex: 'sales_contract', key: 'sales_contract', render: (v: string) => detailData?.sales_contracts?.find((contract) => contract.id === v)?.no || '-' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '运单号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
    { title: '发货日期', dataIndex: 'date', key: 'date', render: (v: string) => formatDate(v) },
    { title: '数量(吨)', dataIndex: 'quantity', key: 'quantity' },
    { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
    { title: '送货地址', dataIndex: 'delivery_address', key: 'delivery_address' },
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const bidResultMap: Record<string, { label: string; color: string }> = {
    pending: { label: '待开标', color: 'orange' },
    won: { label: '中标', color: 'green' },
    lost: { label: '未中标', color: 'red' },
  };

  const biddingColumns = [
    { title: '招标公司', dataIndex: 'bidding_company', key: 'bidding_company' },
    { title: '招标编号', dataIndex: 'bidding_no', key: 'bidding_no' },
    { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '标书费', dataIndex: 'tender_fee', key: 'tender_fee', render: (v: number) => v ? formatCurrency(v) : '-' },
    { title: '投标保证金', dataIndex: 'bid_bond', key: 'bid_bond', render: (v: number) => v ? formatCurrency(v) : '-' },
    { title: '开标时间', dataIndex: 'open_date', key: 'open_date', render: (v: string) => formatDate(v) },
    { title: '中标结果', dataIndex: 'bid_result', key: 'bid_result', render: (v: string) => {
      const info = bidResultMap[v];
      return info ? <Tag color={info.color}>{info.label}</Tag> : '-';
    }},
    { title: '招标代理费', dataIndex: 'agency_fee', key: 'agency_fee', render: (v: number) => v ? formatCurrency(v) : '-' },
  ];

  const saleInvoiceColumns = [
    { title: '所属销售合同', dataIndex: 'sales_contract', key: 'sales_contract', render: (v: string) => detailData?.sales_contracts?.find((contract) => contract.id === v)?.no || '-' },
    { title: '发票号', dataIndex: 'no', key: 'no' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount_qty', render: (v: number) => v || '-' },
    { title: '单价', key: 'unit_price', render: (_: unknown, record: SaleInvoiceRecord) => {
      const sc = detailData?.sales_contracts?.find((contract) => contract.id === record.sales_contract) || detailData?.sales_contract;
      if (!sc) return formatCurrency(0);
      return formatCrossBorderAmount(sc.unit_price, sc.is_cross_border, exchangeRate);
    } },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (v: number, record: SaleInvoiceRecord) => {
      const sc = detailData?.sales_contracts?.find((contract) => contract.id === record.sales_contract) || detailData?.sales_contract;
      if (!sc) return formatCurrency(v);
      return formatCrossBorderAmount(v, sc.is_cross_border, exchangeRate);
    } },
    { title: '开票日期', dataIndex: 'issue_date', key: 'issue_date', render: (v: string) => formatDate(v) },
    managerConfirmationColumn('sale_invoices'),
    invoiceVerificationColumn('sale_invoices'),
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const saleReceiptColumns = [
    { title: '所属销售合同', dataIndex: 'sales_contract', key: 'sales_contract', render: (v: string) => detailData?.sales_contracts?.find((contract) => contract.id === v)?.no || '-' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '收款金额', dataIndex: 'amount', key: 'amount', render: (v: number, record: { sales_contract: string }) => {
      const sc = detailData?.sales_contracts?.find((contract) => contract.id === record.sales_contract) || detailData?.sales_contract;
      if (!sc) return formatCurrency(v);
      return formatCrossBorderAmount(v, sc.is_cross_border, exchangeRate);
    } },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount_qty', render: (v: number) => v || '-' },
    { title: '单价', key: 'unit_price', render: (_: unknown, record: { sales_contract: string }) => {
      const sc = detailData?.sales_contracts?.find((contract) => contract.id === record.sales_contract) || detailData?.sales_contract;
      if (!sc) return formatCurrency(0);
      return formatCrossBorderAmount(sc.unit_price, sc.is_cross_border, exchangeRate);
    } },
    { title: '收款日期', dataIndex: 'receive_date', key: 'receive_date', render: (v: string) => formatDate(v) },
    { title: '收款方式', dataIndex: 'method', key: 'method' },
    { title: '收款账号', dataIndex: 'account', key: 'account' },
    managerConfirmationColumn('sale_receipts'),
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const purchaseArrivalColumns = [
    { title: '所属采购合同', dataIndex: 'purchase_contract', key: 'purchase_contract', render: (v: string) => detailData?.purchase_contracts.find((contract) => contract.id === v)?.no || '-' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '运单号', dataIndex: 'tracking_contract_no', key: 'tracking_contract_no' },
    { title: '发货日期', dataIndex: 'shipment_date', key: 'shipment_date', render: (v: string) => formatDate(v) },
    { title: '数量(吨)', dataIndex: 'quantity', key: 'quantity' },
    { title: '物流公司', dataIndex: 'logistics_company', key: 'logistics_company' },
    { title: '发货地址', dataIndex: 'shipment_address', key: 'shipment_address' },
    { title: '是否中转', dataIndex: 'wether_transit', key: 'wether_transit' },
    { title: '中转仓库', dataIndex: 'transit_warehouse', key: 'transit_warehouse' },
    { title: '送货地址', dataIndex: 'delivery_address', key: 'delivery_address' },
    { title: '运费1', dataIndex: 'freight_1', key: 'freight_1', render: (v: number, record: PurchaseArrivalRecord) => {
      if (!v) return '-';
      const currency = ((record as unknown) as Record<string, unknown>).freight_1_currency as 'USD' | 'CNY' || 'CNY';
      return formatFreightAmount(v, currency, exchangeRate);
    } },
    { title: '运费2', dataIndex: 'freight_2', key: 'freight_2', render: (v: number, record: PurchaseArrivalRecord) => {
      if (!v) return '-';
      const currency = ((record as unknown) as Record<string, unknown>).freight_2_currency as 'USD' | 'CNY' || 'CNY';
      return formatFreightAmount(v, currency, exchangeRate);
    } },
    { title: '杂费', dataIndex: 'miscellaneous_expenses', key: 'miscellaneous_expenses', render: (v: number, record: PurchaseArrivalRecord) => {
      if (!v) return '-';
      const currency = ((record as unknown) as Record<string, unknown>).miscellaneous_expenses_currency as 'USD' | 'CNY' || 'CNY';
      return formatFreightAmount(v, currency, exchangeRate);
    } },
    { title: '关税', dataIndex: 'tariff', key: 'tariff', render: (v: number) => v ? formatCurrency(v) : '-' },
    { title: '增值税', dataIndex: 'value_added_tax', key: 'value_added_tax', render: (v: number) => v ? formatCurrency(v) : '-' },
    managerConfirmationColumn('purchase_arrivals'),
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const purchaseInvoiceColumns = [
    { title: '所属采购合同', dataIndex: 'purchase_contract', key: 'purchase_contract', render: (v: string) => detailData?.purchase_contracts.find((contract) => contract.id === v)?.no || '-' },
    { title: '发票号', dataIndex: 'no', key: 'no' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount_qty', render: (v: number) => v || '-' },
    { title: '单价', key: 'unit_price', render: (_: unknown, record: { purchase_contract: string }) => {
      const pc = detailData?.purchase_contracts.find(p => p.id === record.purchase_contract);
      return formatCurrency(pc?.unit_price || 0);
    } },
    { title: '发票金额', dataIndex: 'amount', key: 'amount', render: (v: number, record: PurchaseInvoiceRecord) => {
      const pc = detailData?.purchase_contracts.find(p => p.id === record.purchase_contract);
      if (!pc) return formatCurrency(v);
      return formatCrossBorderAmount(v, pc.is_cross_border, exchangeRate);
    } },
    { title: '收票日期', dataIndex: 'receive_date', key: 'receive_date', render: (v: string) => formatDate(v) },
    managerConfirmationColumn('purchase_invoices'),
    invoiceVerificationColumn('purchase_invoices'),
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const purchasePaymentColumns = [
    { title: '所属采购合同', dataIndex: 'purchase_contract', key: 'purchase_contract', render: (v: string) => detailData?.purchase_contracts.find((contract) => contract.id === v)?.no || '-' },
    { title: '付款编号', dataIndex: 'no', key: 'no' },
    { title: '品名', dataIndex: 'product_name', key: 'product_name' },
    { title: '货物数量(吨)', dataIndex: 'product_amount', key: 'product_amount_qty', render: (v: number) => v || '-' },
    { title: '单价', key: 'unit_price', render: (_: unknown, record: { purchase_contract: string }) => {
      const pc = detailData?.purchase_contracts.find(p => p.id === record.purchase_contract);
      return formatCurrency(pc?.unit_price || 0);
    } },
    { title: '付款金额', dataIndex: 'amount', key: 'amount', render: (v: number, record: PurchasePaymentRecord) => {
      const pc = detailData?.purchase_contracts.find(p => p.id === record.purchase_contract);
      if (!pc) return formatCurrency(v);
      return formatCrossBorderAmount(v, pc.is_cross_border, exchangeRate);
    } },
    { title: '付款日期', dataIndex: 'pay_date', key: 'pay_date', render: (v: string) => formatDate(v) },
    { title: '付款方式', dataIndex: 'method', key: 'method' },
    managerConfirmationColumn('purchase_payments'),
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '创建时间', dataIndex: 'created', key: 'created', render: (v: string) => formatDate(v) },
  ];

  const cardStyle: React.CSSProperties = { marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' };
  const cardBodyStyle: React.CSSProperties = { padding: 16 };

  const renderSalesInfo = () => {
    if (!detailData || !detailData.sales_contract) return null;
    const salesContracts = detailData.sales_contracts?.length
      ? detailData.sales_contracts
      : [detailData.sales_contract];
    return (
      <>
        {salesContracts.map((sc) => {
          const isCrossBorder = sc.is_cross_border;
          const totalAmountLabel = isCrossBorder
            ? (sc.is_price_excluding_tax ? '总金额（不含税，USD）' : '总金额（USD）')
            : (sc.is_price_excluding_tax ? '总金额（不含税）' : '总金额');
          const totalAmountDisplay = isCrossBorder
            ? `$${sc.total_amount.toFixed(6)}（≈ ¥${(sc.total_amount * exchangeRate).toFixed(6)}）`
            : formatCurrency(sc.total_amount);
          const unitPriceLabel = isCrossBorder
            ? (sc.is_price_excluding_tax ? '单价（不含税，USD）' : '单价（USD）')
            : (sc.is_price_excluding_tax ? '单价（不含税）' : '单价');
          const unitPriceDisplay = isCrossBorder
            ? `$${sc.unit_price.toFixed(6)}（≈ ¥${(sc.unit_price * exchangeRate).toFixed(6)}）`
            : formatCurrency(sc.unit_price);
          return (
            <Card key={sc.id} title={`销售合同 ${sc.no}${isCrossBorder ? '（跨境）' : ''}`} style={cardStyle} styles={{ body: cardBodyStyle }}>
              <Descriptions bordered size="small" column={responsiveDescriptionColumns}>
                <Descriptions.Item label="合同编号">{sc.no}</Descriptions.Item>
                <Descriptions.Item label="品名">{sc.product_name}</Descriptions.Item>
                <Descriptions.Item label="客户">{sc.expand?.customer?.name || sc.customer_name || '-'}</Descriptions.Item>
                <Descriptions.Item label={totalAmountLabel}>{totalAmountDisplay}</Descriptions.Item>
                <Descriptions.Item label={unitPriceLabel}>{unitPriceDisplay}</Descriptions.Item>
                <Descriptions.Item label="总数量">{sc.total_quantity} 吨</Descriptions.Item>
                <Descriptions.Item label="已执行数量">{sc.executed_quantity} 吨</Descriptions.Item>
                <Descriptions.Item label="执行比例">{sc.execution_percent ? percentFormat(sc.execution_percent) : '-'}</Descriptions.Item>
                <Descriptions.Item label="应收金额">{formatCrossBorderAmount(sc.executed_quantity * sc.unit_price, isCrossBorder, exchangeRate)}</Descriptions.Item>
                <Descriptions.Item label="已收金额">{formatCurrency(sc.receipted_amount)}</Descriptions.Item>
                <Descriptions.Item label="收款比例">{sc.receipt_percent ? percentFormat(sc.receipt_percent) : '-'}</Descriptions.Item>
                <Descriptions.Item label="欠款金额">{formatCurrency(sc.debt_amount)}</Descriptions.Item>
                <Descriptions.Item label="已开票金额">{formatCurrency(sc.invoiced_amount)}</Descriptions.Item>
                <Descriptions.Item label="签约日期">{formatDate(sc.sign_date)}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={sc.status === 'executing' ? 'blue' : sc.status === 'completed' ? 'green' : 'red'}>{sc.status === 'executing' ? '执行中' : sc.status === 'completed' ? '已完成' : sc.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="备注">{sc.remark || '-'}</Descriptions.Item>
                <Descriptions.Item label="销售负责人">{sc.sales_manager || '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDate(sc.created_at || '')}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>{renderRecordAttachments('sales_contracts', sc.id, sc.attachments)}</div>
            </Card>
          );
        })}
      </>
    );
  };

  const renderPurchaseInfo = () => {
    if (!detailData) return null;
    return (
      <>
        {detailData.purchase_contracts.map((pc) => {
          const isCrossBorder = pc.is_cross_border;
          const totalAmountLabel = isCrossBorder ? '总金额（USD）' : '总金额';
          const totalAmountDisplay = isCrossBorder
            ? `$${pc.total_amount.toFixed(6)}（≈ ¥${(pc.total_amount  * exchangeRate).toFixed(6)}）`
            : formatCurrency(pc.total_amount);
          const unitPriceLabel = isCrossBorder ? '单价（USD）' : '单价';
          const unitPriceDisplay = isCrossBorder
            ? `$${pc.unit_price.toFixed(6)}（≈ ¥${(pc.unit_price  * exchangeRate).toFixed(6)}）`
            : formatCurrency(pc.unit_price);
          return (
            <Card
              key={pc.id}
              title={`采购合同 ${pc.no}${isCrossBorder ? '（跨境）' : ''}`}
              style={cardStyle}
              styles={{ body: cardBodyStyle }}
            >
              <Descriptions bordered size="small" column={responsiveDescriptionColumns}>
                <Descriptions.Item label="合同编号">{pc.no}</Descriptions.Item>
                <Descriptions.Item label="品名">{pc.product_name}</Descriptions.Item>
                <Descriptions.Item label="供应商">{pc.expand?.supplier?.name || pc.supplier_name || '-'}</Descriptions.Item>
                <Descriptions.Item label={totalAmountLabel}>{totalAmountDisplay}</Descriptions.Item>
                <Descriptions.Item label={unitPriceLabel}>{unitPriceDisplay}</Descriptions.Item>
                <Descriptions.Item label="总数量">{pc.total_quantity} 吨</Descriptions.Item>
                <Descriptions.Item label="已执行数量">{pc.executed_quantity} 吨</Descriptions.Item>
                <Descriptions.Item label="已付金额">{formatCurrency(pc.paid_amount)}</Descriptions.Item>
                <Descriptions.Item label="已开票金额">{formatCurrency(pc.invoiced_amount)}</Descriptions.Item>
                <Descriptions.Item label="签约日期">{formatDate(pc.sign_date || '')}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={pc.status === 'executing' ? 'blue' : pc.status === 'completed' ? 'green' : 'red'}>
                    {pc.status === 'executing' ? '执行中' : pc.status === 'completed' ? '已完成' : pc.status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="备注">{pc.remark || '-'}</Descriptions.Item>
                <Descriptions.Item label="采购负责人">{pc.purchasing_manager || '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{formatDate(pc.created_at || '')}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                {renderRecordAttachments('purchase_contracts', pc.id, pc.attachments)}
              </div>
            </Card>
          );
        })}
      </>
    );
  };

  // 渲染「已执行利润」区块：营业利润、税额、净利润（始终展示，标注未执行部分不计入）
  const renderRealizedProfitItems = (calc: ProfitCalc, fmt: (v: number) => string) => (
    <>
      <Descriptions.Item label={`已执行营业利润（销售已发${calc.realizedSalesQty}吨 / 采购已到${calc.realizedPurchaseQty}吨）`}>
        <span style={{ color: calc.realizedOperatingProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{fmt(calc.realizedOperatingProfit)}</span>
      </Descriptions.Item>
      <Descriptions.Item label="已执行税额">
        <span style={{ fontWeight: 'bold' }}>{fmt(calc.realizedTax)}</span>
      </Descriptions.Item>
      <Descriptions.Item label="已执行净利润" span={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}>
        <span style={{ color: calc.realizedNetProfit < 0 ? '#ff4d4f' : '#faad14', fontWeight: 'bold', fontSize: 15 }}>{fmt(calc.realizedNetProfit)}</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>（未执行部分暂不核算）</span>
      </Descriptions.Item>
    </>
  );

  const renderProfitAnalysis = () => {
    if (!detailData || !detailData.sales_contract) return null;
    const salesContracts = detailData.sales_contracts?.length
      ? detailData.sales_contracts
      : [detailData.sales_contract];
    const salesQuantity = salesContracts.reduce((sum, contract) => sum + contract.total_quantity, 0);
    const hasCrossBorder = salesContracts.some((contract) => contract.is_cross_border)
      || detailData.purchase_contracts.some(pc => pc.is_cross_border);
    const bothCrossBorder = hasCrossBorder;
    const taxRate = detailData.profit.tax_rate ?? DEFAULT_PROFIT_TAX_RATE;
    const taxRateLabel = `${(taxRate * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`;

    const cnyCalc = calcProfitCNY(detailData, exchangeRate);
    const usdCalc = bothCrossBorder ? calcProfitUSD(detailData, exchangeRate) : null;

    return (
      <Card title="利润分析" style={cardStyle} styles={{ body: { padding: 24 } }}>
        {!cnyCalc.quantityMatched && (
          <Alert
            title="数量不匹配"
            description={`销售合同总数量 (${salesQuantity} 吨) 与采购合同总数量之和 (${detailData.profit.purchase_quantity} 吨) 不相等`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {hasCrossBorder && (
          <Alert
            title="跨境交易"
            description={`汇率: 1 USD = ${exchangeRate} CNY。USD 金额已按此汇率换算为 CNY 后进行利润计算。`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {bothCrossBorder ? (
          <Tabs items={[
            {
              key: 'cny',
              label: '人民币分析（CNY）',
              children: (
                <>
                  <Descriptions bordered size="small" column={responsiveDescriptionColumns}>
                    <Descriptions.Item label="销售总金额（含税）">{formatCurrency(cnyCalc.salesAmountIncTax)}</Descriptions.Item>
                    <Descriptions.Item label="采购总金额（含税）">{formatCurrency(cnyCalc.purchaseAmountIncTax)}</Descriptions.Item>
                    <Descriptions.Item label="销售总金额（不含税）">{formatCurrency(cnyCalc.salesAmountExTax)}</Descriptions.Item>
                    <Descriptions.Item label="采购总金额（不含税）">{formatCurrency(cnyCalc.purchaseAmountExTax)}</Descriptions.Item>
                    <Descriptions.Item label="应收金额">{formatCurrency(cnyCalc.salesReceivableAmount)}</Descriptions.Item>
                    <Descriptions.Item label="已付金额">{formatCurrency(cnyCalc.purchasePaidAmount)}</Descriptions.Item>
                    <Descriptions.Item label="运费合计">{formatCurrency(cnyCalc.totalFreight)}</Descriptions.Item>
                    <Descriptions.Item label="杂费合计">{formatCurrency(cnyCalc.totalMiscellaneous)}</Descriptions.Item>
                    <Descriptions.Item label="营业利润">
                      <span style={{ color: cnyCalc.operatingProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatCurrency(cnyCalc.operatingProfit)}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="税额">
                      <span style={{ fontWeight: 'bold' }}>{formatCurrency(cnyCalc.taxAmount)}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="净利润">
                      <span style={{ color: cnyCalc.netProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatCurrency(cnyCalc.netProfit)}</span>
                    </Descriptions.Item>
                    {renderRealizedProfitItems(cnyCalc, formatCurrency)}
                  </Descriptions>
                  <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                    <div>营业利润 = 销售含税 - 采购含税 - 运费 - 杂费 - 关税 - 增值税</div>
                    <div>税额 = (销售含税 - 采购含税) × {taxRateLabel}（本交易税率快照）</div>
                    <div>净利润 = 销售含税 - 采购含税 - 税额 - 运费 - 杂费 - 关税 - 增值税</div>
                    <div>已执行利润 = 按销售已发货量 / 采购已到货量核算，未执行部分暂不计入</div>
                    <div>汇率: 1 USD = {exchangeRate} CNY</div>
                  </div>
                </>
              ),
            },
            {
              key: 'usd',
              label: '美元分析（USD）',
              children: (
                <>
                  <Descriptions bordered size="small" column={responsiveDescriptionColumns}>
                    <Descriptions.Item label="销售总金额（含税）">{formatUSD(usdCalc!.salesAmountIncTax)}</Descriptions.Item>
                    <Descriptions.Item label="采购总金额（含税）">{formatUSD(usdCalc!.purchaseAmountIncTax)}</Descriptions.Item>
                    <Descriptions.Item label="销售总金额（不含税）">{formatUSD(usdCalc!.salesAmountExTax)}</Descriptions.Item>
                    <Descriptions.Item label="采购总金额（不含税）">{formatUSD(usdCalc!.purchaseAmountExTax)}</Descriptions.Item>
                    <Descriptions.Item label="应收金额">{formatUSD(usdCalc!.salesReceivableAmount)}</Descriptions.Item>
                    <Descriptions.Item label="已付金额">{formatUSD(usdCalc!.purchasePaidAmount)}</Descriptions.Item>
                    <Descriptions.Item label="运费合计">{formatUSD(usdCalc!.totalFreight)}</Descriptions.Item>
                    <Descriptions.Item label="杂费合计">{formatUSD(usdCalc!.totalMiscellaneous)}</Descriptions.Item>
                    <Descriptions.Item label="营业利润">
                      <span style={{ color: usdCalc!.operatingProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatUSD(usdCalc!.operatingProfit)}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="税额">
                      <span style={{ fontWeight: 'bold' }}>{formatUSD(usdCalc!.taxAmount)}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="净利润">
                      <span style={{ color: usdCalc!.netProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatUSD(usdCalc!.netProfit)}</span>
                    </Descriptions.Item>
                    {renderRealizedProfitItems(usdCalc!, formatUSD)}
                  </Descriptions>
                  <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                    <div>营业利润 = 销售含税 - 采购含税 - 运费 - 杂费 - 关税 - 增值税</div>
                    <div>税额 = (销售含税 - 采购含税) × {taxRateLabel}（本交易税率快照）</div>
                    <div>净利润 = 销售含税 - 采购含税 - 税额 - 运费 - 杂费 - 关税 - 增值税</div>
                    <div>已执行利润 = 按销售已发货量 / 采购已到货量核算，未执行部分暂不计入</div>
                  </div>
                </>
              ),
            },
          ]} />
        ) : (
          <>
            <Descriptions bordered size="small" column={responsiveDescriptionColumns}>
              <Descriptions.Item label="销售总金额（含税）">{formatCurrency(cnyCalc.salesAmountIncTax)}</Descriptions.Item>
              <Descriptions.Item label="采购总金额（含税）">{formatCurrency(cnyCalc.purchaseAmountIncTax)}</Descriptions.Item>
              <Descriptions.Item label="销售总金额（不含税）">{formatCurrency(cnyCalc.salesAmountExTax)}</Descriptions.Item>
              <Descriptions.Item label="采购总金额（不含税）">{formatCurrency(cnyCalc.purchaseAmountExTax)}</Descriptions.Item>
              <Descriptions.Item label="应收金额">{formatCurrency(cnyCalc.salesReceivableAmount)}</Descriptions.Item>
              <Descriptions.Item label="已付金额">{formatCurrency(cnyCalc.purchasePaidAmount)}</Descriptions.Item>
              <Descriptions.Item label="运费合计">{formatCurrency(cnyCalc.totalFreight)}</Descriptions.Item>
              <Descriptions.Item label="杂费合计">{formatCurrency(cnyCalc.totalMiscellaneous)}</Descriptions.Item>
              <Descriptions.Item label="营业利润">
                <span style={{ color: cnyCalc.operatingProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatCurrency(cnyCalc.operatingProfit)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="税额">
                <span style={{ fontWeight: 'bold' }}>{formatCurrency(cnyCalc.taxAmount)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="净利润">
                <span style={{ color: cnyCalc.netProfit < 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>{formatCurrency(cnyCalc.netProfit)}</span>
              </Descriptions.Item>
              {renderRealizedProfitItems(cnyCalc, formatCurrency)}
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
              <div>营业利润 = 销售含税 - 采购含税 - 运费 - 杂费 - 关税 - 增值税</div>
              <div>税额 = (销售含税 - 采购含税) × {taxRateLabel}（本交易税率快照）</div>
              <div>净利润 = 销售含税 - 采购含税 - 税额 - 运费 - 杂费 - 关税 - 增值税</div>
              <div>已执行利润 = 按销售已发货量 / 采购已到货量核算，未执行部分暂不计入</div>
              {hasCrossBorder && <div>汇率: 1 USD = {exchangeRate} CNY</div>}
            </div>
          </>
        )}
      </Card>
    );
  };

  const handleDeleteAttachment = useCallback(async (collection: string, recordId: string, fileName: string) => {
    try {
      const record = await pb.collection(collection).getOne(recordId);
      const currentAttachments = (record.attachments as string[]) || [];
      const newAttachments = currentAttachments.filter((name) => name !== fileName);

      const formData = new FormData();
      if (newAttachments.length === 0) {
        formData.append('attachments', '');
      } else {
        newAttachments.forEach((name) => {
          formData.append('attachments', name);
        });
      }

      await pb.collection(collection).update(recordId, formData);
      message.success('附件删除成功');
      if (id) {
        const data = isStandalonePurchase
          ? await ComparisonAPI.getPurchaseContractDetail(id)
          : await ComparisonAPI.getContractDetail(id);
        setDetailData(data);
      }
    } catch (error) {
      console.error('Delete attachment error:', error);
      message.error('附件删除失败');
    }
  }, [id, message, isStandalonePurchase]);

  const renderRecordAttachments = (collection: string, recordId: string, attachments: string[] | undefined) => {
    const files = attachments && attachments.length > 0
      ? attachments.map((name: string) => ({
          uid: `${recordId}-${name}`,
          name,
          status: 'done' as const,
          url: `${pb.baseUrl}/api/files/${collection}/${recordId}/${name}`,
        }))
      : [];

    return (
      <div style={{ padding: '8px 0' }}>
        {files.length === 0 && !uploading && (
          <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>暂无附件</div>
        )}
        {files.map((file) => (
          <div key={file.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" download>
              <DownloadOutlined /> {file.name}
            </a>
            <Popconfirm
              title="确定删除此附件？"
              onConfirm={() => handleDeleteAttachment(collection, recordId, file.name)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" danger size="small">删除</Button>
            </Popconfirm>
          </div>
        ))}
        <Upload
          showUploadList={false}
          customRequest={({ file, onSuccess }) => {
            handleAttachmentUpload(collection, recordId, file as File);
            onSuccess?.(null);
          }}
          disabled={uploading}
        >
          <Button size="small" icon={<UploadOutlined />} loading={uploading} style={{ marginTop: 8 }}>上传附件</Button>
        </Upload>
      </div>
    );
  };

  const makeExpandable = (collection: string) => ({
    expandedRowRender: (record: { id: string; attachments?: string[] }) =>
      renderRecordAttachments(collection, record.id, record.attachments),
  });

  const handleDeleteSubRecord = useCallback(async (collection: RecycleCollection, recordId: string) => {
    try {
      await RecycleBinAPI.remove(collection, recordId);
      message.success('记录已移入回收站');
      if (id) {
        const data = isStandalonePurchase
          ? await ComparisonAPI.getPurchaseContractDetail(id)
          : await ComparisonAPI.getContractDetail(id);
        setDetailData(data);
      }
    } catch (error) {
      console.error('Delete sub record error:', error);
      message.error('删除失败');
    }
  }, [id, message, isStandalonePurchase]);

  const deleteColumn = useCallback((collection: RecycleCollection) => ({
    title: '操作',
    key: 'action',
    width: 80,
    render: (_: unknown, record: { id: string }) => (
      <Popconfirm
        title="将此记录移入回收站？"
        description="附件会保留，管理可在数据安全页面恢复。"
        onConfirm={() => handleDeleteSubRecord(collection, record.id)}
        okText="确定"
        cancelText="取消"
      >
        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
      </Popconfirm>
    ),
  }), [handleDeleteSubRecord]);

  const tabItems = (() => {
    const items = [];
    if (detailData?.sales_contract) {
      items.push({
        key: 'sales',
        label: '销售合同信息',
        children: (
          <Spin spinning={loading}>
            {renderSalesInfo()}
            {!loading && detailData && (
              <>
                <Card title="销售发货信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <Table
                    columns={[...salesColumns, deleteColumn('sales_shipments')]}
                    dataSource={detailData.sales_shipments}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无发货记录' }}
                    expandable={makeExpandable('sales_shipments')}
                  />
                </Card>
                <Card title="销售发票信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <Table
                    columns={[...saleInvoiceColumns, deleteColumn('sale_invoices')]}
                    dataSource={detailData.sale_invoices}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无发票记录' }}
                    expandable={makeExpandable('sale_invoices')}
                  />
                </Card>
                <Card title="销售收款信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <Table
                    columns={[...saleReceiptColumns, deleteColumn('sale_receipts')]}
                    dataSource={detailData.sale_receipts}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无收款记录' }}
                    expandable={makeExpandable('sale_receipts')}
                  />
                </Card>
                {biddingRecords.length > 0 && (
                  <Card title="关联投标记录" style={cardStyle} styles={{ body: cardBodyStyle }}>
                    <Table
                      columns={biddingColumns}
                      dataSource={biddingRecords}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      scroll={{ x: 'max-content' }}
                    />
                  </Card>
                )}
              </>
            )}
          </Spin>
        ),
      });
    }
    items.push({
      key: 'purchase',
      label: '采购合同信息',
      children: (
        <Spin spinning={loading}>
          {renderPurchaseInfo()}
          {!loading && detailData && detailData.purchase_contracts.length > 0 && (
            <>
              <Card title="采购到货信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                <Table
                  columns={[...purchaseArrivalColumns, deleteColumn('purchase_arrivals')]}
                  dataSource={detailData.purchase_arrivals}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: '暂无到货记录' }}
                  expandable={makeExpandable('purchase_arrivals')}
                />
              </Card>
              <Card title="采购发票信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                <Table
                  columns={[...purchaseInvoiceColumns, deleteColumn('purchase_invoices')]}
                  dataSource={detailData.purchase_invoices}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: '暂无发票记录' }}
                  expandable={makeExpandable('purchase_invoices')}
                />
              </Card>
              <Card title="采购付款信息" style={cardStyle} styles={{ body: cardBodyStyle }}>
                <Table
                  columns={[...purchasePaymentColumns, deleteColumn('purchase_payments')]}
                  dataSource={detailData.purchase_payments}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: '暂无付款记录' }}
                  expandable={makeExpandable('purchase_payments')}
                />
              </Card>
            </>
          )}
        </Spin>
      ),
    });
    return items;
  })();

  const headerTitle = useMemo(() => {
    if (detailData?.business_deal) {
      const salesNos = (detailData.sales_contracts || []).map((contract) => contract.no).join('、');
      const purchaseNos = detailData.purchase_contracts.map((contract) => contract.no).join('、');
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>总体交易：销售 {salesNos} / 采购 {purchaseNos}</span>
          <Tag color="blue">{detailData.sales_contracts?.length || 0} × {detailData.purchase_contracts.length}</Tag>
        </div>
      );
    }
    if (isStandalonePurchase && detailData?.purchase_contracts[0]) {
      const pc = detailData.purchase_contracts[0];
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{pc.no} - {pc.product_name}</span>
          <Tag color="blue">{pc.expand?.supplier?.name || pc.supplier_name || '-'}</Tag>
        </div>
      );
    }
    if (detailData?.sales_contract) {
      const sc = detailData.sales_contract;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{sc.no} - {sc.product_name}</span>
          <Tag color="blue">{sc.expand?.customer?.name || sc.customer_name || '-'}</Tag>
        </div>
      );
    }
    return '合同详情';
  }, [detailData, isStandalonePurchase]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detailData) {
    return (
      <div style={{ padding: 0 }}>
        <Empty description="未找到合同数据" />
      </div>
    );
  }

  return (
    <div style={{ padding: 0 }}>
      <Card
        title={headerTitle}
        extra={
          <Button
            type="primary"
            icon={<LeftOutlined />}
            onClick={() => navigate('/manager/overview')}
          >
            返回
          </Button>
        }
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        styles={{ body: { padding: 24 } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key: string) => setActiveTab(key)}
          items={tabItems}
          style={{ marginBottom: 24 }}
        />
        {renderProfitAnalysis()}
      </Card>
    </div>
  );
};

export default ContractDetailPage;
