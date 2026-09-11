import React from 'react';
import { Button, Checkbox, DatePicker, Input, Segmented, Select } from 'antd';
import { ClearOutlined, ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';

import type { OverviewDateRange, OverviewRelationFilter, OverviewSortField } from './overview-model';

const { RangePicker } = DatePicker;

interface SelectOption {
  label: string;
  value: string;
}

interface OverviewControlsProps {
  salesCount: number;
  purchaseCount: number;
  linkedEdgeCount: number;
  unlinkedCount: number;
  searchText: string;
  customerFilter?: string;
  supplierFilter?: string;
  dateRange: OverviewDateRange;
  relationFilter: OverviewRelationFilter;
  sortField: OverviewSortField;
  sortDescending: boolean;
  customers: SelectOption[];
  suppliers: SelectOption[];
  allVisibleSelected: boolean;
  selectedCount: number;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onCustomerChange: (value?: string) => void;
  onSupplierChange: (value?: string) => void;
  onDateRangeChange: (value: OverviewDateRange) => void;
  onRelationFilterChange: (value: OverviewRelationFilter) => void;
  onSortFieldChange: (value: OverviewSortField) => void;
  onToggleSortOrder: () => void;
  onToggleSelectAll: () => void;
  onExport: () => void;
  onClearSelection: () => void;
}

export const OverviewControls: React.FC<OverviewControlsProps> = ({
  salesCount,
  purchaseCount,
  linkedEdgeCount,
  unlinkedCount,
  searchText,
  customerFilter,
  supplierFilter,
  dateRange,
  relationFilter,
  sortField,
  sortDescending,
  customers,
  suppliers,
  allVisibleSelected,
  selectedCount,
  onRefresh,
  onSearchChange,
  onCustomerChange,
  onSupplierChange,
  onDateRangeChange,
  onRelationFilterChange,
  onSortFieldChange,
  onToggleSortOrder,
  onToggleSelectAll,
  onExport,
  onClearSelection,
}) => (
  <>
    <header className="overview-page-header">
      <div>
        <h1>关联合同总览</h1>
        <p>每行代表一笔总体交易；销售与采购合同平级展示，并统一查看执行、收付款和开票进度。</p>
      </div>
      <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新数据</Button>
    </header>

    <section className="overview-summary" aria-label="合同汇总">
      <div className="overview-summary-item"><span>销售合同</span><strong>{salesCount}</strong></div>
      <div className="overview-summary-item"><span>采购合同</span><strong>{purchaseCount}</strong></div>
      <div className="overview-summary-item"><span>总体交易</span><strong>{linkedEdgeCount}</strong></div>
      <div className="overview-summary-item"><span>未关联合同</span><strong>{unlinkedCount}</strong></div>
    </section>

    <section className="overview-toolbar" aria-label="筛选和批量操作">
      <div className="overview-toolbar-filters">
        <div className="overview-relation-filter">
          <span>显示范围</span>
          <Segmented
            aria-label="合同关联状态"
            value={relationFilter}
            onChange={(value) => onRelationFilterChange(value as OverviewRelationFilter)}
            options={[
              { label: '全部合同', value: 'all' },
              { label: '独立合同', value: 'unlinked' },
              { label: '关联合同', value: 'linked' },
            ]}
          />
        </div>
        <Input value={searchText} onChange={(event) => onSearchChange(event.target.value)} placeholder="合同号、品名、客户或供应商" prefix={<SearchOutlined />} allowClear style={{ width: 250 }} />
        <Select value={customerFilter} onChange={onCustomerChange} options={customers} placeholder="全部客户" allowClear showSearch optionFilterProp="label" style={{ width: 160 }} />
        <Select value={supplierFilter} onChange={onSupplierChange} options={suppliers} placeholder="全部供应商" allowClear showSearch optionFilterProp="label" style={{ width: 160 }} />
        <RangePicker value={dateRange} onChange={(value) => onDateRangeChange(value as OverviewDateRange)} placeholder={['签订日期起', '签订日期止']} style={{ width: 250 }} />
        <Select
          value={sortField}
          onChange={onSortFieldChange}
          options={[
            { label: '按签订日期', value: 'date' },
            { label: '按合同号', value: 'no' },
            { label: '按执行进度', value: 'progress' },
          ]}
          style={{ width: 130 }}
        />
        <Button onClick={onToggleSortOrder}>{sortDescending ? '降序' : '升序'}</Button>
      </div>

      <div className="overview-toolbar-actions">
        <Checkbox checked={allVisibleSelected} indeterminate={selectedCount > 0 && !allVisibleSelected} onChange={onToggleSelectAll}>全选筛选结果</Checkbox>
        <Button type="primary" icon={<ExportOutlined />} disabled={selectedCount === 0} onClick={onExport}>导出所选（{selectedCount}）</Button>
        {selectedCount > 0 && <Button icon={<ClearOutlined />} onClick={onClearSelection}>清除</Button>}
      </div>
    </section>
  </>
);
