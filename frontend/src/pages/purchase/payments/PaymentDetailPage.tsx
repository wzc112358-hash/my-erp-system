import { useParams } from 'react-router-dom';
import { PaymentDetail } from './PaymentDetail';

export const PaymentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return null;
  }

  return <PaymentDetail />;
};

export default PaymentDetailPage;
