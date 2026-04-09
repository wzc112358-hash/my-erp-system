import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Checkbox, Input, Select, DatePicker, Button, Spin, Empty, Space, App, Modal } from 'antd';
import { SearchOutlined, ExportOutlined, ClearOutlined, DownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ComparisonAPI } from '@/api/comparison';
import type { OverviewContract, PurchaseSummary } from '@/types/comparison';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface ContractRow {
  sales?: OverviewContract;
  purchases: OverviewContract[];
  purchaseSummary?: PurchaseSummary;
}

type SortField = 'no' | 'shipmentDate' | 'payDate' | 'salesReceiveDate' | 'salesInvoiceDate' | undefined;

const formatCurrency = (value: number) => `¥${value?.toLocaleString() || 0}`;
const formatDate = (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-';
const formatDateShort = (date: string) => date ? dayjs(date).format('YYYY.MM.DD') : '-';

const SalesContractCard: React.FC<{
  contract: OverviewContract;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: () => void;
}> = ({ contract, selected, onSelect, onClick }) => {
  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: 8,
        background: selected ? 'rgba(24, 144, 255, 0.04)' : '#fff',
        border: selected ? '1px solid #1890ff' : '1px solid #f0f0f0',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      bodyStyle={{ padding: 12 }}
      hoverable
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Checkbox
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onSelect(contract.id, e.target.checked); }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 'bold', fontSize: 14 }}>
              销售合同: {contract.no}
            </span>
            <span style={{ color: '#666', fontSize: 12 }}>
              {contract.customerName}
            </span>
          </div>
          
          <div style={{ fontSize: 12, color: '#666', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>品名: <span style={{ color: '#333' }}>{contract.productName}</span></div>
            <div>数量: <span style={{ color: '#333' }}>{contract.quantity} 吨</span></div>
            <div>总金额: <span style={{ color: '#333' }}>{formatCurrency(contract.totalAmount)}</span></div>
            <div>收款时间: <span style={{ color: '#333' }}>{formatDate(contract.paymentDate || '')}</span></div>
            <div>发票号: <span style={{ color: '#333' }}>{contract.invoiceNo || '-'}</span></div>
            <div>开票时间: <span style={{ color: '#333' }}>{formatDate(contract.invoiceIssueDate || '')}</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const PurchaseContractCard: React.FC<{
  contract: OverviewContract;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}> = ({ contract, selected, onSelect }) => {
  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: 8,
        background: selected ? 'rgba(24, 144, 255, 0.04)' : '#fff',
        border: selected ? '1px solid #1890ff' : '1px solid #f0f0f0',
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Checkbox
          checked={selected}
          onChange={(e) => onSelect(contract.id, e.target.checked)}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 'bold', fontSize: 14 }}>
              采购合同: {contract.no}
            </span>
            <span style={{ color: '#666', fontSize: 12 }}>
              {contract.supplierName}
            </span>
          </div>
          
          <div style={{ fontSize: 12, color: '#666', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div>品名: <span style={{ color: '#333' }}>{contract.productName}</span></div>
            <div>数量: <span style={{ color: '#333' }}>{contract.quantity} 吨</span></div>
            <div>总金额: <span style={{ color: '#333' }}>{formatCurrency(contract.totalAmount)}</span></div>
            <div>付款时间: <span style={{ color: '#333' }}>{formatDate(contract.paymentDate || '')}</span></div>
            <div>发货时间: <span style={{ color: '#333' }}>{formatDate(contract.shipmentDate || '')}</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const MultiPurchaseSummaryCard: React.FC<{
  summary: PurchaseSummary;
  selected: boolean;
  onSelect: (ids: string[], checked: boolean) => void;
  onClick: () => void;
}> = ({ summary, selected, onSelect, onClick }) => {
  const formatDates = (dates: string[]) => {
    if (dates.length === 0) return '-';
    return dates.map(formatDateShort).join('/');
  };

  const formatNos = (nos: string[]) => {
    if (nos.length === 0) return '-';
    return nos.join(' / ');
  };

  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: 8,
        background: selected ? 'rgba(24, 144, 255, 0.04)' : '#fff',
        border: selected ? '1px solid #1890ff' : '1px solid #f0f0f0',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      bodyStyle={{ padding: 12 }}
      onClick={onClick}
      hoverable
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Checkbox
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(summary.purchaseIds, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 'bold', fontSize: 14 }}>
              共 {summary.purchaseIds.length} 个采购合同
            </span>
            <DownOutlined style={{ color: '#999', fontSize: 12 }} />
          </div>
          
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
            采购合同号: <span style={{ color: '#333' }}>{formatNos(summary.purchaseNos)}</span>
          </div>
          
          <div style={{ fontSize: 12, color: '#666' }}>
            <div style={{ marginBottom: 4 }}>
              发货时间: <span style={{ color: '#333' }}>{formatDates(summary.shipmentDates)}</span>
            </div>
            <div>
              付款时间: <span style={{ color: '#333' }}>{formatDates(summary.paymentDates)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const PurchaseDetailModal: React.FC<{
  visible: boolean;
  purchases: OverviewContract[];
  selectedPurchases: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onClose: () => void;
}> = ({ visible, purchases, selectedPurchases, onSelect, onClose }) => {
  return (
    <Modal
      title="采购合同详情"
      open={visible}
      onCancel={onClose}
      footer={null}
      width="80%"
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {purchases.map(purchase => (
          <PurchaseContractCard
            key={purchase.id}
            contract={purchase}
            selected={selectedPurchases.has(purchase.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </Modal>
  );
};

interface ConnectionLinesProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  leftColumnRef: React.RefObject<HTMLDivElement | null>;
  rows: ContractRow[];
  rowHeights: Map<number, number>;
}

const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  containerRef,
  leftColumnRef,
  rows,
  rowHeights,
}) => {
  const [lines, setLines] = useState<React.ReactElement[]>([]);

  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current || !leftColumnRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const leftColumnRect = leftColumnRef.current.getBoundingClientRect();
      
      const leftColumnRight = leftColumnRect.right - containerRect.left;
      const rightColumnLeft = leftColumnRight + 24;

      const newLines: React.ReactElement[] = [];
      let currentTop = 0;

      rows.forEach((row, idx) => {
        const rowHeight = rowHeights.get(idx) || 0;
        
        if (row.sales && row.purchaseSummary) {
          const salesCardMiddle = currentTop + rowHeight / 2;
          const purchaseCardMiddle = currentTop + rowHeight / 2;

          const pathD = `M ${leftColumnRight - 10} ${salesCardMiddle} 
                         C ${(leftColumnRight + rightColumnLeft) / 2} ${salesCardMiddle}, 
                           ${(leftColumnRight + rightColumnLeft) / 2} ${purchaseCardMiddle}, 
                           ${rightColumnLeft + 10} ${purchaseCardMiddle}`;

          newLines.push(
            <g key={`connection-${row.sales.id}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#1890ff"
                strokeWidth="2"
                opacity="0.5"
              />
              <circle
                cx={rightColumnLeft + 10}
                cy={purchaseCardMiddle}
                r="4"
                fill="#1890ff"
                opacity="0.5"
              />
            </g>
          );
        }

        currentTop += rowHeight + 12;
      });

      setLines(newLines);
    };

    updateLines();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateLines);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, leftColumnRef, rows, rowHeights]);

  if (lines.length === 0) return null;

  return (
    <svg style={{ 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      width: '100%', 
      height: '100%', 
      pointerEvents: 'none', 
      overflow: 'visible',
      zIndex: 1,
    }}>
      {lines}
    </svg>
  );
};

export const OverviewPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  
  const [salesContracts, setSalesContracts] = useState<OverviewContract[]>([]);
  const [purchaseContracts, setPurchaseContracts] = useState<OverviewContract[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchText, setSearchText] = useState('');
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [supplierFilter, setSupplierFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [sortField, setSortField] = useState<SortField>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalPurchases, setModalPurchases] = useState<OverviewContract[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  
  const [rowHeights, setRowHeights] = useState<Map<number, number>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ComparisonAPI.getAllContractsForOverview();
      setSalesContracts(result.salesContracts);
      setPurchaseContracts(result.purchaseContracts);
    } catch (error) {
      const err = error as { name?: string; message?: string; cause?: { name?: string } };
      const isAborted =
        err.name === 'AbortError' ||
        err.name === 'CanceledError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('autocancelled') ||
        err.cause?.name === 'AbortError';
      if (!isAborted) {
        console.error('Fetch overview data error:', error);
        message.error('加载合同数据失败');
      }
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const customers = useMemo(() => {
    const names = new Set(salesContracts.map(c => c.customerName).filter(Boolean));
    return Array.from(names).map(name => ({ label: name, value: name }));
  }, [salesContracts]);

  const suppliers = useMemo(() => {
    const names = new Set(purchaseContracts.map(c => c.supplierName).filter(Boolean));
    return Array.from(names).map(name => ({ label: name, value: name }));
  }, [purchaseContracts]);

  const filteredSales = useMemo(() => {
    return salesContracts.filter(contract => {
      if (searchText && !contract.no.toLowerCase().includes(searchText.toLowerCase()) && 
          !contract.productName.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      if (customerFilter && contract.customerName !== customerFilter) {
        return false;
      }
      if (dateRange && dateRange[0] && dateRange[1]) {
        let filterDate: dayjs.Dayjs | null = null;
        
        switch (sortField) {
          case 'shipmentDate': {
            const shipmentDates = contract.purchaseSummary?.shipmentDates || [];
            if (shipmentDates.length > 0) {
              const earliest = shipmentDates.sort()[0];
              filterDate = dayjs(earliest);
            }
            break;
          }
          case 'payDate': {
            const payDates = contract.purchaseSummary?.paymentDates || [];
            if (payDates.length > 0) {
              const earliest = payDates.sort()[0];
              filterDate = dayjs(earliest);
            }
            break;
          }
          case 'salesReceiveDate':
            if (contract.paymentDate) {
              filterDate = dayjs(contract.paymentDate);
            }
            break;
          case 'salesInvoiceDate':
            if (contract.invoiceIssueDate) {
              filterDate = dayjs(contract.invoiceIssueDate);
            }
            break;
          default:
            filterDate = dayjs(contract.created);
        }
        
        if (filterDate && (filterDate.isBefore(dateRange[0], 'day') || filterDate.isAfter(dateRange[1], 'day'))) {
          return false;
        }
      }
      return true;
    });
  }, [salesContracts, searchText, customerFilter, dateRange, sortField]);

  const sortedSales = useMemo(() => {
    if (!sortField) return filteredSales;
    return [...filteredSales].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'no':
          cmp = a.no.localeCompare(b.no);
          break;
        case 'shipmentDate': {
          const aShipmentDates = a.purchaseSummary?.shipmentDates || [];
          const bShipmentDates = b.purchaseSummary?.shipmentDates || [];
          const aEarliestShipment = aShipmentDates.length > 0 ? dayjs(aShipmentDates.sort()[0]).unix() : 0;
          const bEarliestShipment = bShipmentDates.length > 0 ? dayjs(bShipmentDates.sort()[0]).unix() : 0;
          cmp = aEarliestShipment - bEarliestShipment;
          break;
        }
        case 'payDate': {
          const aPayDates = a.purchaseSummary?.paymentDates || [];
          const bPayDates = b.purchaseSummary?.paymentDates || [];
          const aEarliestPay = aPayDates.length > 0 ? dayjs(aPayDates.sort()[0]).unix() : 0;
          const bEarliestPay = bPayDates.length > 0 ? dayjs(bPayDates.sort()[0]).unix() : 0;
          cmp = aEarliestPay - bEarliestPay;
          break;
        }
        case 'salesReceiveDate':
          cmp = (dayjs(a.paymentDate).unix() || 0) - (dayjs(b.paymentDate).unix() || 0);
          break;
        case 'salesInvoiceDate':
          cmp = (dayjs(a.invoiceIssueDate).unix() || 0) - (dayjs(b.invoiceIssueDate).unix() || 0);
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredSales, sortField, sortOrder]);

  const contractRows = useMemo((): ContractRow[] => {
    const rows: ContractRow[] = [];
    const purchaseMap = new Map(purchaseContracts.map(p => [p.id, p]));
    
    const associatedSales = sortedSales.filter(s => 
      s.associatedPurchaseIds && s.associatedPurchaseIds.length > 0
    );
    
    associatedSales.forEach(sales => {
      const purchaseIds = sales.associatedPurchaseIds || [];
      let purchases = purchaseIds
        .map(id => purchaseMap.get(id))
        .filter((p): p is OverviewContract => !!p);
      
      if (supplierFilter) {
        purchases = purchases.filter(p => p.supplierName === supplierFilter);
        if (purchases.length === 0) return;
      }

      const summary: PurchaseSummary = !supplierFilter
        ? sales.purchaseSummary!
        : {
            purchaseIds: purchases.map(p => p.id),
            purchaseNos: purchases.map(p => p.no),
            shipmentDates: purchases.flatMap(p => p.shipmentDate ? [p.shipmentDate] : []),
            paymentDates: purchases.flatMap(p => p.paymentDate ? [p.paymentDate] : []),
          };
      
      rows.push({
        sales,
        purchases,
        purchaseSummary: summary,
      });
    });
    
    if (!supplierFilter) {
      const unassociatedSales = sortedSales.filter(s => 
        !s.associatedPurchaseIds || s.associatedPurchaseIds.length === 0
      );
      
      unassociatedSales.forEach(sales => {
        rows.push({
          sales,
          purchases: [],
        });
      });
    }
    
    const unassociatedPurchases = purchaseContracts.filter(
      p => (!p.associatedSalesIds || p.associatedSalesIds.length === 0) &&
           (!supplierFilter || p.supplierName === supplierFilter)
    );
    
    if (unassociatedPurchases.length > 0) {
      rows.push({
        purchases: unassociatedPurchases,
        purchaseSummary: {
          purchaseIds: unassociatedPurchases.map(p => p.id),
          purchaseNos: unassociatedPurchases.map(p => p.no),
          shipmentDates: unassociatedPurchases.flatMap(p => p.shipmentDate ? [p.shipmentDate] : []),
          paymentDates: unassociatedPurchases.flatMap(p => p.paymentDate ? [p.paymentDate] : []),
        },
      });
    }
    
    return rows;
  }, [sortedSales, purchaseContracts, supplierFilter]);

  const handleSalesSelect = useCallback((id: string, checked: boolean) => {
    setSelectedSales(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
        const contract = salesContracts.find(c => c.id === id);
        if (contract?.associatedPurchaseIds) {
          setSelectedPurchases(pprev => {
            const pnext = new Set(pprev);
            contract.associatedPurchaseIds!.forEach(pid => pnext.add(pid));
            return pnext;
          });
        }
      } else {
        next.delete(id);
      }
      return next;
    });
  }, [salesContracts]);

  const handlePurchaseSelect = useCallback((id: string, checked: boolean) => {
    setSelectedPurchases(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
        const contract = purchaseContracts.find(c => c.id === id);
        if (contract?.associatedSalesIds) {
          setSelectedSales(pprev => {
            const pnext = new Set(pprev);
            contract.associatedSalesIds!.forEach(sid => pnext.add(sid));
            return pnext;
          });
        }
      } else {
        next.delete(id);
      }
      return next;
    });
  }, [purchaseContracts]);

  const handleMultiPurchaseSelect = useCallback((ids: string[], checked: boolean) => {
    setSelectedPurchases(prev => {
      const next = new Set(prev);
      ids.forEach(id => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
    
    if (checked) {
      ids.forEach(id => {
        const contract = purchaseContracts.find(c => c.id === id);
        if (contract?.associatedSalesIds) {
          setSelectedSales(prev => {
            const next = new Set(prev);
            contract.associatedSalesIds!.forEach(sid => next.add(sid));
            return next;
          });
        }
      });
    }
  }, [purchaseContracts]);

  const handleOpenModal = useCallback((purchases: OverviewContract[]) => {
    setModalPurchases(purchases);
    setModalVisible(true);
  }, []);

  const handleExport = () => {
    const salesIds = Array.from(selectedSales).join(',');
    const purchaseIds = Array.from(selectedPurchases).join(',');
    navigate(`/manager/reports?selectedSales=${salesIds}&selectedPurchase=${purchaseIds}`);
  };

  const handleClearSelection = () => {
    setSelectedSales(new Set());
    setSelectedPurchases(new Set());
  };

  const handleSortChange = (value: SortField) => {
    if (!value) {
      setSortField(undefined);
      return;
    }
    if (value === sortField) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(value);
      setSortOrder('desc');
    }
  };

  const isAllSelectedForRow = useCallback((row: ContractRow) => {
    if (!row.purchaseSummary) return false;
    return row.purchaseSummary.purchaseIds.every(id => selectedPurchases.has(id));
  }, [selectedPurchases]);

  const measureRowHeights = useCallback(() => {
    if (!leftColumnRef.current || !rightColumnRef.current) return;

    const leftRows = leftColumnRef.current.querySelectorAll('[data-row-idx]');
    const rightRows = rightColumnRef.current.querySelectorAll('[data-row-idx]');
    
    const heights = new Map<number, number>();
    
    leftRows.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-row-idx') || '-1');
      if (idx >= 0) {
        const rect = el.getBoundingClientRect();
        heights.set(idx, Math.max(heights.get(idx) || 0, rect.height));
      }
    });

    rightRows.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-row-idx') || '-1');
      if (idx >= 0) {
        const rect = el.getBoundingClientRect();
        heights.set(idx, Math.max(heights.get(idx) || 0, rect.height));
      }
    });

    setRowHeights(heights);
  }, []);

  useEffect(() => {
    if (!loading) {
      const timeoutId = setTimeout(measureRowHeights, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [loading, contractRows, measureRowHeights]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(measureRowHeights);
    });

    if (leftColumnRef.current) {
      resizeObserver.observe(leftColumnRef.current);
    }
    if (rightColumnRef.current) {
      resizeObserver.observe(rightColumnRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [measureRowHeights]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap>
            <Input
              placeholder="搜索合同编号/品名"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              prefix={<SearchOutlined />}
              allowClear
            />
            <Select
              placeholder="选择客户"
              value={customerFilter}
              onChange={setCustomerFilter}
              allowClear
              style={{ width: 150 }}
              options={customers}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <Select
              placeholder="选择供应商"
              value={supplierFilter}
              onChange={setSupplierFilter}
              allowClear
              style={{ width: 150 }}
              options={suppliers}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              style={{ width: 260 }}
            />
            <Select
              placeholder="排序字段"
              value={sortField}
              onChange={handleSortChange}
              allowClear
              style={{ width: 140 }}
              options={[
                { label: '销售合同号', value: 'no' },
                { label: '采购发货时间', value: 'shipmentDate' },
                { label: '采购付款时间', value: 'payDate' },
                { label: '销售收款时间', value: 'salesReceiveDate' },
                { label: '销售开票时间', value: 'salesInvoiceDate' },
              ]}
            />
            <Button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? '升序' : '降序'}
            </Button>
          </Space>
          
          <Space>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleExport}
              disabled={selectedSales.size === 0 && selectedPurchases.size === 0}
            >
              导出报表 ({selectedSales.size + selectedPurchases.size})
            </Button>
            {(selectedSales.size > 0 || selectedPurchases.size > 0) && (
              <Button icon={<ClearOutlined />} onClick={handleClearSelection}>
                清除选择
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {contractRows.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="暂无合同数据" />
        </Card>
      ) : (
        <div 
          ref={containerRef}
          style={{ 
            position: 'relative',
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: 24 
          }}
        >
          <ConnectionLines 
            containerRef={containerRef}
            leftColumnRef={leftColumnRef}
            rows={contractRows}
            rowHeights={rowHeights}
          />
          
          <div ref={leftColumnRef}>
            <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12, color: '#333' }}>
              销售合同 ({filteredSales.length})
            </div>
            {contractRows.map((row, idx) => (
              <div key={`sales-${row.sales?.id || 'empty-' + idx}`} data-row-idx={idx}>
                {row.sales ? (
                  <SalesContractCard
                    contract={row.sales}
                    selected={selectedSales.has(row.sales.id)}
                    onSelect={handleSalesSelect}
                    onClick={() => navigate(`/manager/overview/contract/${row.sales!.id}`)}
                  />
                ) : (
                  <div style={{ height: rowHeights.get(idx) || 0, marginBottom: 8 }} />
                )}
              </div>
            ))}
          </div>
          
          <div ref={rightColumnRef}>
            <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12, color: '#333' }}>
              采购合同 ({purchaseContracts.length})
            </div>
            {contractRows.map((row, idx) => (
              <div key={`purchase-group-${idx}`} data-row-idx={idx}>
                {row.purchaseSummary ? (
                  <div style={{ minHeight: rowHeights.get(idx) || 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <MultiPurchaseSummaryCard
                      summary={row.purchaseSummary}
                      selected={isAllSelectedForRow(row)}
                      onSelect={handleMultiPurchaseSelect}
                      onClick={() => handleOpenModal(row.purchases)}
                    />
                  </div>
                ) : (
                  <div style={{ height: rowHeights.get(idx) || 0, marginBottom: 8 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <PurchaseDetailModal
        visible={modalVisible}
        purchases={modalPurchases}
        selectedPurchases={selectedPurchases}
        onSelect={handlePurchaseSelect}
        onClose={() => setModalVisible(false)}
      />
    </div>
  );
};

export default OverviewPage;