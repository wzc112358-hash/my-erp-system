import { useParams } from 'react-router-dom';
import { ReceiptDetail } from './ReceiptDetail';

export const ReceiptDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return null;
  }

  return <ReceiptDetail />;
};

export default ReceiptDetailPage;
