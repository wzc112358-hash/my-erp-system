import { useEffect } from 'react';
import { Alert, Form, Input, Modal } from 'antd';

interface InvoiceRejectModalProps {
  open: boolean;
  invoiceLabel?: string;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}

interface RejectFormValues {
  reason: string;
}

export const InvoiceRejectModal = ({
  open,
  invoiceLabel = '这张发票',
  submitting = false,
  onCancel,
  onSubmit,
}: InvoiceRejectModalProps) => {
  const [form] = Form.useForm<RejectFormValues>();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [form, open]);

  const handleSubmit = async () => {
    const { reason } = await form.validateFields();
    await onSubmit(reason.trim());
  };

  return (
    <Modal
      title={`驳回${invoiceLabel}`}
      open={open}
      okText="确认驳回"
      cancelText="取消"
      okButtonProps={{ danger: true, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      closable={!submitting}
      maskClosable={!submitting}
      onCancel={onCancel}
      onOk={handleSubmit}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title="驳回后，创建人会收到通知"
        description="员工修改资料或重新上传附件并提交后，该发票会重新进入经理待确认事项。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="reason"
          label="驳回原因"
          rules={[
            { required: true, whitespace: true, message: '请填写驳回原因' },
            { max: 500, message: '驳回原因不能超过 500 个字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            maxLength={500}
            showCount
            placeholder="请说明需要修改的资料、附件或发票信息"
            autoFocus
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
