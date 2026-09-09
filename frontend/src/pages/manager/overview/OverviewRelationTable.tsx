import React from 'react';
import { Empty, Pagination } from 'antd';

import type { OverviewContract } from '@/types/comparison';
import type { RelationRow } from './overview-model';
import { OverviewContractCard } from './OverviewContractCard';

interface OverviewRelationTableProps {
  rows: RelationRow[];
  totalRows: number;
  currentPage: number;
  pageSize: number;
  selectedSales: Set<string>;
  selectedPurchases: Set<string>;
  onPageChange: (page: number) => void;
  onSelect: (contract: OverviewContract, checked: boolean) => void;
  onView: (contract: OverviewContract) => void;
  onViewFlow: (contract: OverviewContract) => void;
  onLink: (contract: OverviewContract) => void;
  onUnlink: (sales: OverviewContract, purchase: OverviewContract) => void;
  onDelete: (contract: OverviewContract) => void;
}

export const OverviewRelationTable: React.FC<OverviewRelationTableProps> = ({
  rows,
  totalRows,
  currentPage,
  pageSize,
  selectedSales,
  selectedPurchases,
  onPageChange,
  onSelect,
  onView,
  onViewFlow,
  onLink,
  onUnlink,
  onDelete,
}) => {
  if (totalRows === 0) {
    return <div className="overview-empty"><Empty description="没有符合筛选条件的合同" /></div>;
  }

  return (
    <section className="overview-table" aria-label="销售采购关联合同">
      <div className="overview-table-head"><div>销售合同</div><div /><div>采购合同</div></div>

      {rows.map((row) => (
        <div className="overview-relation-row" key={row.id}>
          <div className="overview-relation-side">
            {row.sales ? (
              <OverviewContractCard
                contract={row.sales}
                selected={selectedSales.has(row.sales.id)}
                onSelect={(_, checked) => onSelect(row.sales!, checked)}
                onView={() => onView(row.sales!)}
                onViewFlow={() => onViewFlow(row.sales!)}
                onLink={() => onLink(row.sales!)}
                onDelete={() => onDelete(row.sales!)}
              />
            ) : <div className="overview-empty-side">未关联销售合同</div>}
          </div>

          <div className={`overview-connector ${row.sales && row.purchases.length ? '' : 'is-empty'}`}>
            {row.sales && row.purchases.length > 0 && <span className="overview-connector-badge">{row.purchases.length}</span>}
          </div>

          <div className="overview-relation-side is-purchase">
            {row.purchases.length > 0 ? (
              <div className="overview-purchase-stack">
                {row.purchases.map((purchase) => (
                  <OverviewContractCard
                    key={purchase.id}
                    contract={purchase}
                    compact={row.purchases.length > 1}
                    selected={selectedPurchases.has(purchase.id)}
                    onSelect={(_, checked) => onSelect(purchase, checked)}
                    onView={() => onView(purchase)}
                    onViewFlow={() => onViewFlow(purchase)}
                    onLink={() => onLink(purchase)}
                    onUnlink={row.sales ? () => onUnlink(row.sales!, purchase) : undefined}
                    onDelete={() => onDelete(purchase)}
                  />
                ))}
              </div>
            ) : <div className="overview-empty-side">未关联采购合同</div>}
          </div>
        </div>
      ))}

      <div className="overview-pagination">
        <Pagination current={currentPage} pageSize={pageSize} total={totalRows} onChange={onPageChange} showSizeChanger={false} showTotal={(total) => `共 ${total} 组对应关系`} />
      </div>
    </section>
  );
};
