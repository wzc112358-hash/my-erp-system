import React, { useMemo, useState } from 'react';
import { Alert, Empty, Modal, Select, Space, Typography } from 'antd';

import type { OverviewContract } from '@/types/comparison';

const { Text } = Typography;

export interface ContractLinkSource {
  type: 'sales' | 'purchase';
  contract: OverviewContract;
}

interface LinkContractsModalProps {
  source: ContractLinkSource | null;
  salesContracts: OverviewContract[];
  purchaseContracts: OverviewContract[];
  confirmLoading: boolean;
  onCancel: () => void;
  onConfirm: (purchaseContractId: string, salesContractId: string) => void;
}

export const LinkContractsModal: React.FC<LinkContractsModalProps> = ({
  source,
  salesContracts,
  purchaseContracts,
  confirmLoading,
  onCancel,
  onConfirm,
}) => {
  const [selectedId, setSelectedId] = useState<string>();

  const candidates = source?.type === 'sales'
    ? purchaseContracts
    : salesContracts;

  const options = useMemo(() => candidates.map((contract) => ({
    value: contract.id,
    label: `${contract.no} · ${contract.productName} · ${contract.type === 'sales' ? contract.customerName : contract.supplierName}`,
  })), [candidates]);

  const isSalesSource = source?.type === 'sales';
  const targetLabel = isSalesSource ? '采购合同' : '销售合同';

  const handleConfirm = () => {
    if (!source || !selectedId) return;
    if (isSalesSource) {
      onConfirm(selectedId, source.contract.id);
      return;
    }
    onConfirm(source.contract.id, selectedId);
  };

  return (
    <Modal
      title={isSalesSource ? '为销售合同关联采购合同' : '为采购合同关联销售合同'}
      open={source !== null}
      okText="确认关联"
      cancelText="取消"
      okButtonProps={{ disabled: !selectedId }}
      confirmLoading={confirmLoading}
      onOk={handleConfirm}
      onCancel={onCancel}
      destroyOnHidden
    >
      {source && (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text type="secondary">当前合同</Text>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              {source.contract.no} · {source.contract.productName}
            </div>
          </div>

          {options.length > 0 ? (
            <Select
              value={selectedId}
              onChange={setSelectedId}
              options={options}
              placeholder={`搜索并选择${targetLabel}`}
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={isSalesSource ? '暂无未关联的采购合同' : '暂无可关联的销售合同'}
            />
          )}

          <Alert
            type="info"
            showIcon
            title="支持一份销售关联多份采购，也支持一份采购关联多份销售；重复关系会自动去重。"
          />
        </Space>
      )}
    </Modal>
  );
};
