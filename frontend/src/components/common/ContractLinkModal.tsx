import React, { useMemo, useState } from 'react';
import { Modal, Select, Space, Typography } from 'antd';

const { Text } = Typography;

export interface ContractLinkOption {
  id: string;
  no: string;
  productName: string;
}

interface ContractLinkModalProps {
  open: boolean;
  source?: ContractLinkOption;
  targetLabel: '销售合同' | '采购合同';
  targets: ContractLinkOption[];
  confirmLoading: boolean;
  onCancel: () => void;
  onConfirm: (targetId: string) => void;
}

export const ContractLinkModal: React.FC<ContractLinkModalProps> = ({
  open,
  source,
  targetLabel,
  targets,
  confirmLoading,
  onCancel,
  onConfirm,
}) => {
  const [selectedId, setSelectedId] = useState<string>();

  const options = useMemo(() => targets.map((target) => ({
    value: target.id,
    label: `${target.no} · ${target.productName}`,
  })), [targets]);

  return (
    <Modal
      title={`关联${targetLabel}`}
      open={open}
      okText="确认关联"
      cancelText="取消"
      okButtonProps={{ disabled: !selectedId }}
      confirmLoading={confirmLoading}
      onOk={() => selectedId && onConfirm(selectedId)}
      onCancel={onCancel}
      afterClose={() => setSelectedId(undefined)}
      destroyOnHidden
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {source && (
          <div>
            <Text type="secondary">当前合同</Text>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              {source.no} · {source.productName}
            </div>
          </div>
        )}
        <Select
          value={selectedId}
          onChange={setSelectedId}
          options={options}
          placeholder={`搜索并选择${targetLabel}`}
          showSearch
          optionFilterProp="label"
          notFoundContent={`暂无可关联的${targetLabel}`}
          style={{ width: '100%' }}
        />
      </Space>
    </Modal>
  );
};
