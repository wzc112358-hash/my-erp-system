import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ComparisonAPI } from '@/api/comparison';
import { ContractOperationsAPI } from '@/api/contract-operations';
import { getPbErrorMessage, isAbortedError } from '@/api/helpers';
import type { OverviewContract } from '@/types/comparison';
import { LinkContractsModal } from './overview/LinkContractsModal';
import type { ContractLinkSource } from './overview/LinkContractsModal';
import { OverviewControls } from './overview/OverviewControls';
import { OverviewRelationTable } from './overview/OverviewRelationTable';
import {
  buildRelationRows,
  buildVisibleContractIds,
} from './overview/overview-model';
import type { OverviewDateRange, OverviewRelationFilter, OverviewSortField } from './overview/overview-model';
import './OverviewPage.css';
const PAGE_SIZE = 8;
export const OverviewPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [salesContracts, setSalesContracts] = useState<OverviewContract[]>([]);
  const [purchaseContracts, setPurchaseContracts] = useState<OverviewContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [customerFilter, setCustomerFilter] = useState<string>();
  const [supplierFilter, setSupplierFilter] = useState<string>();
  const [dateRange, setDateRange] = useState<OverviewDateRange>(null);
  const [relationFilter, setRelationFilter] = useState<OverviewRelationFilter>('all');
  const [sortField, setSortField] = useState<OverviewSortField>('date');
  const [sortDescending, setSortDescending] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [linkSource, setLinkSource] = useState<ContractLinkSource | null>(null);
  const [linking, setLinking] = useState(false);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ComparisonAPI.getAllContractsForOverview();
      setSalesContracts(result.salesContracts);
      setPurchaseContracts(result.purchaseContracts);
    } catch (error) {
      if (!isAbortedError(error)) {
        console.error('Fetch contract overview error:', error);
        message.error(getPbErrorMessage(error, '加载合同数据失败'));
      }
    } finally {
      setLoading(false);
    }
  }, [message]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const relationRows = useMemo(() => buildRelationRows({
    salesContracts,
    purchaseContracts,
    searchText,
    customerFilter,
    supplierFilter,
    dateRange,
    relationFilter,
    sortField,
    sortDescending,
  }), [customerFilter, dateRange, purchaseContracts, relationFilter, salesContracts, searchText, sortDescending, sortField, supplierFilter]);
  useEffect(() => {
    setCurrentPage(1);
  }, [customerFilter, dateRange, relationFilter, searchText, sortDescending, sortField, supplierFilter]);
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(relationRows.length / PAGE_SIZE));
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, relationRows.length]);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return relationRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, relationRows]);
  const customers = useMemo(() => Array.from(new Set(
    salesContracts.map((contract) => contract.customerName).filter((name): name is string => Boolean(name)),
  )).map((name) => ({ label: name, value: name })), [salesContracts]);
  const suppliers = useMemo(() => Array.from(new Set(
    purchaseContracts.map((contract) => contract.supplierName).filter((name): name is string => Boolean(name)),
  )).map((name) => ({ label: name, value: name })), [purchaseContracts]);
  const linkedEdgeCount = useMemo(
    () => salesContracts.reduce((sum, contract) => sum + (contract.associatedPurchaseIds?.length || 0), 0),
    [salesContracts],
  );
  const unlinkedSalesCount = salesContracts.filter((contract) => !contract.associatedPurchaseIds?.length).length;
  const unlinkedPurchaseCount = purchaseContracts.filter((contract) => !contract.associatedSalesIds?.length).length;
  const visibleIds = useMemo(() => buildVisibleContractIds(relationRows), [relationRows]);
  const allVisibleSelected = visibleIds.sales.size + visibleIds.purchases.size > 0
    && Array.from(visibleIds.sales).every((id) => selectedSales.has(id))
    && Array.from(visibleIds.purchases).every((id) => selectedPurchases.has(id));
  const selectedCount = selectedSales.size + selectedPurchases.size;

  const selectContract = useCallback((contract: OverviewContract, checked: boolean) => {
    const setter = contract.type === 'sales' ? setSelectedSales : setSelectedPurchases;
    setter((previous) => {
      const next = new Set(previous);
      if (checked) next.add(contract.id);
      else next.delete(contract.id);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelectedSales(new Set());
    setSelectedPurchases(new Set());
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      clearSelection();
      return;
    }
    setSelectedSales(new Set([...selectedSales, ...visibleIds.sales]));
    setSelectedPurchases(new Set([...selectedPurchases, ...visibleIds.purchases]));
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (selectedSales.size) params.set('selectedSales', Array.from(selectedSales).join(','));
    if (selectedPurchases.size) params.set('selectedPurchase', Array.from(selectedPurchases).join(','));
    navigate(`/manager/reports?${params.toString()}`);
  };

  const handleLinkContracts = useCallback(async (purchaseId: string, salesId: string) => {
    setLinking(true);
    try {
      await ComparisonAPI.linkPurchaseToSales(purchaseId, salesId);
      message.success('合同关联成功');
      setLinkSource(null);
      await fetchData();
    } catch (error) {
      message.error(getPbErrorMessage(error, '合同关联失败'));
    } finally {
      setLinking(false);
    }
  }, [fetchData, message]);

  const handleUnlink = useCallback((sales: OverviewContract, purchase: OverviewContract) => {
    modal.confirm({
      title: '解除这两个合同的关联？',
      content: `${sales.no} 与 ${purchase.no} 的业务记录都会保留，仅移除合同之间的对应关系。`,
      okText: '解除关联',
      cancelText: '取消',
      onOk: async () => {
        try {
          await ContractOperationsAPI.unlink(sales.id, purchase.id);
          message.success('合同关联已解除');
          await fetchData();
        } catch (error) {
          message.error(getPbErrorMessage(error, '解除关联失败'));
          throw error;
        }
      },
    });
  }, [fetchData, message, modal]);

  const handleDelete = useCallback((contract: OverviewContract) => {
    const ownedRecords = contract.type === 'sales'
      ? '发货、销售收款和销售开票记录'
      : '到货、采购收票和采购付款记录';
    modal.confirm({
      title: `解除关联并将 ${contract.no} 移入回收站？`,
      content: `该合同及其${ownedRecords}会进入同一回收批次，附件仍保留；其他合同只解除引用。可在“数据安全”页面恢复。`,
      okText: '移入回收站',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await ContractOperationsAPI.unlinkAndDelete(contract.type, contract.id);
          message.success('合同及其关联业务记录已移入回收站');
          await fetchData();
        } catch (error) {
          message.error(getPbErrorMessage(error, '删除失败'));
          throw error;
        }
      },
    });
  }, [fetchData, message, modal]);

  const viewContract = (contract: OverviewContract) => {
    navigate(contract.type === 'sales'
      ? `/manager/overview/contract/${contract.id}`
      : `/manager/overview/purchase/${contract.id}`);
  };

  if (loading) {
    return <div className="overview-page"><div className="overview-loading"><Spin size="large" /></div></div>;
  }

  return (
    <div className="overview-page">
      <OverviewControls
        salesCount={salesContracts.length}
        purchaseCount={purchaseContracts.length}
        linkedEdgeCount={linkedEdgeCount}
        unlinkedCount={unlinkedSalesCount + unlinkedPurchaseCount}
        searchText={searchText}
        customerFilter={customerFilter}
        supplierFilter={supplierFilter}
        dateRange={dateRange}
        relationFilter={relationFilter}
        sortField={sortField}
        sortDescending={sortDescending}
        customers={customers}
        suppliers={suppliers}
        allVisibleSelected={allVisibleSelected}
        selectedCount={selectedCount}
        onRefresh={fetchData}
        onSearchChange={setSearchText}
        onCustomerChange={setCustomerFilter}
        onSupplierChange={setSupplierFilter}
        onDateRangeChange={setDateRange}
        onRelationFilterChange={setRelationFilter}
        onSortFieldChange={setSortField}
        onToggleSortOrder={() => setSortDescending((value) => !value)}
        onToggleSelectAll={toggleSelectAll}
        onExport={handleExport}
        onClearSelection={clearSelection}
      />

      <OverviewRelationTable
        rows={paginatedRows}
        totalRows={relationRows.length}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        selectedSales={selectedSales}
        selectedPurchases={selectedPurchases}
        onPageChange={setCurrentPage}
        onSelect={selectContract}
        onView={viewContract}
        onViewFlow={(contract) => navigate(`/manager/progress-flow?contractId=${contract.id}&type=${contract.type}`)}
        onLink={(contract) => setLinkSource({ type: contract.type, contract })}
        onUnlink={handleUnlink}
        onDelete={handleDelete}
      />

      <LinkContractsModal
        key={linkSource ? `${linkSource.type}-${linkSource.contract.id}` : 'link-closed'}
        source={linkSource}
        salesContracts={salesContracts}
        purchaseContracts={purchaseContracts}
        confirmLoading={linking}
        onCancel={() => setLinkSource(null)}
        onConfirm={handleLinkContracts}
      />
    </div>
  );
};

export default OverviewPage;
