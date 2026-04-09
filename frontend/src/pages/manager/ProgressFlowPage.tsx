import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, type Node, type Edge, MarkerType } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import dayjs from 'dayjs';
import { App, Button, Card, Select, Spin, Empty, Modal, Descriptions, Tag, Upload, Badge } from 'antd';
import { ComparisonAPI } from '@/api/comparison';
import type { FlowContractOption, FlowNodeData, ContractDetailData } from '@/types/comparison';
import { pb } from '@/lib/pocketbase';
import './ProgressFlow.css';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

const formatCurrency = (v: number) => `¥${(v ?? 0).toLocaleString()}`;
const formatDate = (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-';

const FLOW_TYPE_TITLE: Record<string, string> = {
  sales_contract: '销售合同',
  purchase_contract: '采购合同',
  sales_shipment: '销售发货',
  sale_invoice: '销项票',
  sale_receipt: '销售收款',
  purchase_arrival: '采购到货',
  purchase_invoice: '采购进项票',
  purchase_payment: '采购付款',
};

const getStatusTag = (status?: string) => {
  switch (status) {
    case 'approved': return <Tag color="green">已确认</Tag>;
    case 'pending': return <Tag color="orange">待确认</Tag>;
    case 'rejected': return <Tag color="default">已驳回</Tag>;
    default: return null;
  }
};

const getNodeBorderStyle = (data: FlowNodeData) => {
  if (data.flowType === 'sales_contract' || data.flowType === 'purchase_contract') {
    return data.status === 'completed'
      ? { borderColor: '#52c41a', borderStyle: 'solid' }
      : { borderColor: '#1890ff', borderStyle: 'solid' };
  }
  if (data.managerConfirmed === 'pending') {
    return { borderColor: '#ff4d4f', borderStyle: 'dashed' };
  }
  if (data.managerConfirmed === 'rejected') {
    return { borderColor: '#d9d9d9', borderStyle: 'solid' };
  }
  return { borderColor: '#52c41a', borderStyle: 'solid' };
};

const getNodeBgColor = (flowType: string) => {
  switch (flowType) {
    case 'sales_contract': return '#e6f7ff';
    case 'purchase_contract': return '#fff7e6';
    case 'sales_shipment': return '#f6ffed';
    case 'sale_invoice': return '#f9f0ff';
    case 'sale_receipt': return '#fff0f6';
    case 'purchase_arrival': return '#fcffe6';
    case 'purchase_invoice': return '#fff2e8';
    case 'purchase_payment': return '#e6fffb';
    default: return '#fff';
  }
};

const CustomFlowNode: React.FC<{ data: FlowNodeData }> = ({ data }) => {
  const borderStyle = getNodeBorderStyle(data);

  return (
    <div
      className="flow-node"
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        border: `2px ${borderStyle.borderStyle} ${borderStyle.borderColor}`,
        background: getNodeBgColor(data.flowType),
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flow-node-title">{data.title}</div>
      <div className="flow-node-label">{data.label}</div>
      {data.sublabel && <div className="flow-node-info">{data.sublabel}</div>}
      {data.amount != null && <div className="flow-node-amount">{formatCurrency(data.amount)}</div>}
      {data.date && <div className="flow-node-date">{data.date}</div>}
      {data.managerConfirmed && <div className="flow-node-status">{getStatusTag(data.managerConfirmed)}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = { custom: CustomFlowNode };

function buildFlowGraph(data: ContractDetailData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 140, nodesep: 50 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sc = data.sales_contract;
  const scId = `sc-${sc.id}`;

  const edgeDefaults = {
    type: 'smoothstep' as const,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#888' },
    style: { stroke: '#888', strokeWidth: 2 },
    animated: false,
  };

  g.setNode(scId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  nodes.push({
    id: scId,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: {
      flowType: 'sales_contract',
      title: FLOW_TYPE_TITLE.sales_contract,
      label: sc.no,
      sublabel: sc.product_name,
      status: sc.status,
      amount: sc.total_amount,
      no: sc.no,
      collectionName: 'sales_contracts',
      recordId: sc.id,
      record: sc as unknown as Record<string, unknown>,
      attachments: sc.attachments,
    } as FlowNodeData,
  });

  data.sales_shipments.forEach((s) => {
    const nId = `ss-${s.id}`;
    g.setNode(nId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: nId, type: 'custom', position: { x: 0, y: 0 },
      data: {
        flowType: 'sales_shipment', title: FLOW_TYPE_TITLE.sales_shipment,
        label: s.tracking_contract_no || '发货',
        sublabel: `${s.quantity} 吨 | ${formatDate(s.date)}`,
        collectionName: 'sales_shipments', recordId: s.id,
        record: s as unknown as Record<string, unknown>,
        attachments: s.attachments,
      } as FlowNodeData,
    });
    edges.push({ id: `e-${scId}-${nId}`, source: scId, target: nId, ...edgeDefaults });
  });

  data.sale_invoices.forEach((si) => {
    const nId = `si-${si.id}`;
    g.setNode(nId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: nId, type: 'custom', position: { x: 0, y: 0 },
      data: {
        flowType: 'sale_invoice', title: FLOW_TYPE_TITLE.sale_invoice,
        label: si.no || '-',
        sublabel: formatCurrency(si.amount),
        date: formatDate(si.issue_date),
        managerConfirmed: si.manager_confirmed,
        collectionName: 'sale_invoices', recordId: si.id,
        record: si as unknown as Record<string, unknown>,
        attachments: si.attachments,
      } as FlowNodeData,
    });
    edges.push({ id: `e-${scId}-${nId}`, source: scId, target: nId, ...edgeDefaults });
  });

  data.sale_receipts.forEach((r) => {
    const nId = `sr-${r.id}`;
    g.setNode(nId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: nId, type: 'custom', position: { x: 0, y: 0 },
      data: {
        flowType: 'sale_receipt', title: FLOW_TYPE_TITLE.sale_receipt,
        label: '收款',
        sublabel: formatCurrency(r.amount),
        date: formatDate(r.receive_date),
        managerConfirmed: r.manager_confirmed,
        collectionName: 'sale_receipts', recordId: r.id,
        record: r as unknown as Record<string, unknown>,
        attachments: r.attachments,
      } as FlowNodeData,
    });
    edges.push({ id: `e-${scId}-${nId}`, source: scId, target: nId, ...edgeDefaults });
  });

  data.purchase_contracts.forEach((pc) => {
    const pcId = `pc-${pc.id}`;
    g.setNode(pcId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: pcId, type: 'custom', position: { x: 0, y: 0 },
      data: {
        flowType: 'purchase_contract', title: FLOW_TYPE_TITLE.purchase_contract,
        label: pc.no,
        sublabel: pc.product_name,
        status: pc.status, amount: pc.total_amount,
        collectionName: 'purchase_contracts', recordId: pc.id,
        record: pc as unknown as Record<string, unknown>,
        attachments: pc.attachments,
      } as FlowNodeData,
    });
    edges.push({ id: `e-${scId}-${pcId}`, source: scId, target: pcId, ...edgeDefaults });

    data.purchase_arrivals.filter(a => a.purchase_contract === pc.id).forEach((a) => {
      const aId = `pa-${a.id}`;
      g.setNode(aId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: aId, type: 'custom', position: { x: 0, y: 0 },
        data: {
          flowType: 'purchase_arrival', title: FLOW_TYPE_TITLE.purchase_arrival,
          label: a.tracking_contract_no || '-',
          sublabel: `${a.quantity} 吨 | ${formatDate(a.shipment_date)}`,
          managerConfirmed: a.manager_confirmed,
          collectionName: 'purchase_arrivals', recordId: a.id,
          record: a as unknown as Record<string, unknown>,
          attachments: a.attachments,
        } as FlowNodeData,
      });
      edges.push({ id: `e-${pcId}-${aId}`, source: pcId, target: aId, ...edgeDefaults });
    });

    data.purchase_invoices.filter(i => i.purchase_contract === pc.id).forEach((i) => {
      const iId = `pi-${i.id}`;
      g.setNode(iId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: iId, type: 'custom', position: { x: 0, y: 0 },
        data: {
          flowType: 'purchase_invoice', title: FLOW_TYPE_TITLE.purchase_invoice,
          label: i.no || '-',
          sublabel: formatCurrency(i.amount),
          date: formatDate(i.receive_date),
          managerConfirmed: i.manager_confirmed,
          collectionName: 'purchase_invoices', recordId: i.id,
          record: i as unknown as Record<string, unknown>,
          attachments: i.attachments,
        } as FlowNodeData,
      });
      edges.push({ id: `e-${pcId}-${iId}`, source: pcId, target: iId, ...edgeDefaults });
    });

    data.purchase_payments.filter(p => p.purchase_contract === pc.id).forEach((p) => {
      const pId = `pp-${p.id}`;
      g.setNode(pId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: pId, type: 'custom', position: { x: 0, y: 0 },
        data: {
          flowType: 'purchase_payment', title: FLOW_TYPE_TITLE.purchase_payment,
          label: p.no || '-',
          sublabel: formatCurrency(p.amount),
          date: formatDate(p.pay_date),
          managerConfirmed: p.manager_confirmed,
          collectionName: 'purchase_payments', recordId: p.id,
          record: p as unknown as Record<string, unknown>,
          attachments: p.attachments,
        } as FlowNodeData,
      });
      edges.push({ id: `e-${pcId}-${pId}`, source: pcId, target: pId, ...edgeDefaults });
    });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  nodes.forEach((node) => {
    const pos = g.node(node.id);
    if (pos) {
      node.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
    }
  });

  return { nodes, edges };
}

const renderModalDetail = (data: FlowNodeData) => {
  const r = data.record;
  if (!r) return null;

  const renderAttachments = () => {
    const files = data.attachments && data.attachments.length > 0
      ? (Array.isArray(data.attachments) ? data.attachments : [data.attachments]).map((name: string) => ({
          uid: `${data.recordId}-${name}`,
          name,
          status: 'done' as const,
          url: `${pb.baseUrl}/api/files/${data.collectionName}/${data.recordId}/${name}`,
        }))
      : [];
    return (
      <Descriptions.Item label="附件" span={2}>
        {files.length === 0 ? <span style={{ color: '#999' }}>暂无</span> : (
          <Upload fileList={files} showUploadList={{ showRemoveIcon: false }} />
        )}
      </Descriptions.Item>
    );
  };

  switch (data.flowType) {
    case 'sales_contract':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="合同编号">{r.no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="总金额">{formatCurrency(r.total_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="总数量">{r.total_quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="单价">{formatCurrency(r.unit_price as number)}</Descriptions.Item>
          <Descriptions.Item label="已执行数量">{r.executed_quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="已收金额">{formatCurrency(r.receipted_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="已开票金额">{formatCurrency(r.invoiced_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="签约日期">{formatDate(r.sign_date as string)}</Descriptions.Item>
          <Descriptions.Item label="状态">{r.status as string}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created_at as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'purchase_contract':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="合同编号">{r.no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="总金额">{formatCurrency(r.total_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="总数量">{r.total_quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="单价">{formatCurrency(r.unit_price as number)}</Descriptions.Item>
          <Descriptions.Item label="已执行数量">{r.executed_quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="已付金额">{formatCurrency(r.paid_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="已开票金额">{formatCurrency(r.invoiced_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="签约日期">{formatDate((r.sign_date as string) || '')}</Descriptions.Item>
          <Descriptions.Item label="状态">{r.status as string}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created_at as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'sales_shipment':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="运单号">{r.tracking_contract_no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="发货日期">{formatDate(r.date as string)}</Descriptions.Item>
          <Descriptions.Item label="数量">{r.quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="物流公司">{(r.logistics_company as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="送货地址">{(r.delivery_address as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'sale_invoice':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="发票号">{r.no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="发票类型">{(r.invoice_type as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="产品金额">{formatCurrency(r.product_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="发票金额">{formatCurrency(r.amount as number)}</Descriptions.Item>
          <Descriptions.Item label="开票日期">{formatDate(r.issue_date as string)}</Descriptions.Item>
          <Descriptions.Item label="经理确认状态">{getStatusTag(r.manager_confirmed as string)}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'sale_receipt':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="收款金额">{formatCurrency(r.amount as number)}</Descriptions.Item>
          <Descriptions.Item label="产品金额">{formatCurrency(r.product_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="收款日期">{formatDate(r.receive_date as string)}</Descriptions.Item>
          <Descriptions.Item label="收款方式">{(r.method as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="收款账号">{(r.account as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="经理确认状态">{getStatusTag(r.manager_confirmed as string)}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'purchase_arrival':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="运单号">{(r.tracking_contract_no as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="发货日期">{formatDate(r.shipment_date as string)}</Descriptions.Item>
          <Descriptions.Item label="数量">{r.quantity as number} 吨</Descriptions.Item>
          <Descriptions.Item label="物流公司">{(r.logistics_company as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="发货地址">{(r.shipment_address as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="是否中转">{(r.wether_transit as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="中转仓库">{(r.transit_warehouse as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="送货地址">{(r.delivery_address as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="运费1">{formatCurrency(r.freight_1 as number)}</Descriptions.Item>
          <Descriptions.Item label="运费2">{formatCurrency(r.freight_2 as number)}</Descriptions.Item>
          <Descriptions.Item label="杂费">{formatCurrency(r.miscellaneous_expenses as number)}</Descriptions.Item>
          <Descriptions.Item label="经理确认状态">{getStatusTag(r.manager_confirmed as string)}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'purchase_invoice':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="发票号">{r.no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="发票类型">{(r.invoice_type as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="产品金额">{formatCurrency(r.product_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="发票金额">{formatCurrency(r.amount as number)}</Descriptions.Item>
          <Descriptions.Item label="收票日期">{formatDate(r.receive_date as string)}</Descriptions.Item>
          <Descriptions.Item label="经理确认状态">{getStatusTag(r.manager_confirmed as string)}</Descriptions.Item>
          <Descriptions.Item label="是否验票">{r.is_verified === 'yes' ? <Tag color="green">已验票</Tag> : <Tag color="orange">未验票</Tag>}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    case 'purchase_payment':
      return (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="付款编号">{r.no as string}</Descriptions.Item>
          <Descriptions.Item label="品名">{r.product_name as string}</Descriptions.Item>
          <Descriptions.Item label="产品金额">{formatCurrency(r.product_amount as number)}</Descriptions.Item>
          <Descriptions.Item label="付款金额">{formatCurrency(r.amount as number)}</Descriptions.Item>
          <Descriptions.Item label="付款日期">{formatDate(r.pay_date as string)}</Descriptions.Item>
          <Descriptions.Item label="付款方式">{(r.method as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="经理确认状态">{getStatusTag(r.manager_confirmed as string)}</Descriptions.Item>
          <Descriptions.Item label="备注">{(r.remark as string) || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(r.created as string)}</Descriptions.Item>
          {renderAttachments()}
        </Descriptions>
      );
    default:
      return null;
  }
};

export const ProgressFlowPage: React.FC = () => {
  const { message } = App.useApp();
  const [selectedContract, setSelectedContract] = useState<string | undefined>(undefined);
  const [contractOptions, setContractOptions] = useState<FlowContractOption[]>([]);
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<FlowNodeData | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refreshOptions = useCallback(async () => {
    try {
      const options = await ComparisonAPI.getUncompletedContracts();
      setContractOptions(options);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const fetchOptions = async () => {
      setOptionsLoading(true);
      try {
        const options = await ComparisonAPI.getUncompletedContracts();
        setContractOptions(options);
      } catch (err) {
        const e = err as { name?: string; message?: string };
        const isAborted = e.name === 'AbortError' || e.name === 'CanceledError' || (e.message?.includes('aborted') ?? false);
        if (!isAborted) {
          message.error('加载合同列表失败');
        }
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchOptions();
  }, [message]);

  useEffect(() => {
    if (!selectedContract) return;
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const detail = await ComparisonAPI.getContractDetail(selectedContract);
        if (!cancelled) {
          const graph = buildFlowGraph(detail);
          setFlowNodes(graph.nodes);
          setFlowEdges(graph.edges);
        }
      } catch (err) {
        const e = err as { name?: string; message?: string };
        const isAborted = e.name === 'AbortError' || e.name === 'CanceledError' || (e.message?.includes('aborted') ?? false);
        if (!cancelled && !isAborted) {
          console.error('Failed to load flow data:', err);
          message.error('加载流程数据失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [selectedContract, message]);

  const handleConfirm = useCallback(async () => {
    if (!modalData || modalData.managerConfirmed !== 'pending') return;
    setConfirming(true);
    try {
      await pb.collection(modalData.collectionName).update(modalData.recordId, {
        manager_confirmed: 'approved',
      });
      message.success('确认成功');
      setModalVisible(false);
      setModalData(null);
      if (selectedContract) {
        const detail = await ComparisonAPI.getContractDetail(selectedContract);
        const graph = buildFlowGraph(detail);
        setFlowNodes(graph.nodes);
        setFlowEdges(graph.edges);
      }
      refreshOptions();
    } catch {
      message.error('确认失败');
    } finally {
      setConfirming(false);
    }
  }, [modalData, selectedContract, message, refreshOptions]);

  const handleReject = useCallback(async () => {
    if (!modalData || modalData.managerConfirmed !== 'pending') return;
    setConfirming(true);
    try {
      await pb.collection(modalData.collectionName).update(modalData.recordId, {
        manager_confirmed: 'rejected',
      });
      message.success('已驳回');
      setModalVisible(false);
      setModalData(null);
      if (selectedContract) {
        const detail = await ComparisonAPI.getContractDetail(selectedContract);
        const graph = buildFlowGraph(detail);
        setFlowNodes(graph.nodes);
        setFlowEdges(graph.edges);
      }
      refreshOptions();
    } catch {
      message.error('驳回失败');
    } finally {
      setConfirming(false);
    }
  }, [modalData, selectedContract, message, refreshOptions]);

  const getModalFooter = useCallback(() => {
    if (!modalData) return null;
    const needsConfirm = modalData.flowType !== 'sales_contract'
      && modalData.flowType !== 'purchase_contract'
      && modalData.flowType !== 'sales_shipment';
    if (!needsConfirm) return null;
    if (modalData.managerConfirmed === 'pending') {
      return [
        <Button key="reject" danger loading={confirming} onClick={handleReject}>驳回</Button>,
        <Button key="confirm" type="primary" loading={confirming} onClick={handleConfirm}>确认</Button>,
      ];
    }
    return null;
  }, [modalData, confirming, handleConfirm, handleReject]);

  const selectOptions = useMemo(() => {
    return contractOptions.map(opt => {
      const dateStr = opt.signDate ? dayjs(opt.signDate).format('YYYY-MM-DD') : '';
      const baseLabel = `${opt.no} | ${opt.productName} | ${opt.quantity}吨 | ${dateStr}`;
      return {
        value: opt.id,
        label: baseLabel,
        pendingCount: opt.pendingCount ?? 0,
      };
    });
  }, [contractOptions]);

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            value={selectedContract}
            onChange={setSelectedContract}
            style={{ width: 520 }}
            showSearch
            placeholder="选择合同查看流程"
            loading={optionsLoading}
            filterOption={(input, option) =>
              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
            }
            options={selectOptions}
            optionRender={(option) => {
              const pendingCount = (option.data as { pendingCount?: number }).pendingCount ?? 0;
              return (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>{option.label}</span>
                  {pendingCount > 0 && (
                    <Badge count={pendingCount} style={{ backgroundColor: '#ff4d4f', marginLeft: 8 }} />
                  )}
                </span>
              );
            }}
          />
          {loading && <Spin />}
        </div>
      </Card>

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        {selectedContract && !loading && flowNodes.length > 0 ? (
          <div style={{ height: 700 }}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_e, node) => {
                setModalData(node.data as FlowNodeData);
                setModalVisible(true);
              }}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
            {loading ? <Spin size="large" /> : <Empty description={selectedContract ? '暂无流程数据' : '请选择一个合同查看流程图'} />}
          </div>
        )}
      </Card>

      <Modal
        title={modalData ? `${modalData.title} - ${modalData.label}` : '节点详情'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setModalData(null); }}
        centered
        width={720}
        footer={getModalFooter()}
      >
        {modalData && renderModalDetail(modalData)}
      </Modal>
    </div>
  );
};

export default ProgressFlowPage;
