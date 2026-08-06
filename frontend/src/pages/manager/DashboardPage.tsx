import { App, Button, Empty, Skeleton } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ComparisonAPI } from '@/api/comparison';
import type { OverviewContract } from '@/types/comparison';
import { RecentContractOverview } from './overview/RecentContractOverview';
import './DashboardPage.css';

export const DashboardPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [salesContracts, setSalesContracts] = useState<OverviewContract[]>([]);
  const [purchaseContracts, setPurchaseContracts] = useState<OverviewContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await ComparisonAPI.getAllContractsForOverview();
      setSalesContracts(data.salesContracts);
      setPurchaseContracts(data.purchaseContracts);
    } catch (error) {
      const requestError = error as { name?: string; message?: string; cause?: { name?: string } };
      const isAborted = requestError.name === 'AbortError'
        || requestError.name === 'CanceledError'
        || requestError.message?.includes('aborted')
        || requestError.message?.includes('autocancelled')
        || requestError.cause?.name === 'AbortError';
      if (!isAborted) {
        console.error('Load manager dashboard error:', error);
        setLoadFailed(true);
        message.error('加载首页总览失败');
      }
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="manager-dashboard-page manager-page">
        <div className="manager-dashboard-page__state">
          <Skeleton active paragraph={{ rows: 12 }} />
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="manager-dashboard-page manager-page">
        <div className="manager-dashboard-page__state">
          <Empty description="首页总览加载失败">
            <Button onClick={() => void loadData()}>重新加载</Button>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="manager-dashboard-page manager-page">
      <RecentContractOverview
        salesContracts={salesContracts}
        purchaseContracts={purchaseContracts}
        onOpenContract={(id) => navigate(`/manager/overview/contract/${id}`)}
      />
    </div>
  );
};

export default DashboardPage;
