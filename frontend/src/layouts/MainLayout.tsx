import React, { useState, useEffect } from 'react';
import { Layout, Menu, Drawer, Badge } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  TeamOutlined,
  FileTextOutlined,
  CarOutlined,
  FileDoneOutlined,
  DollarOutlined,
  InboxOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  LinkOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { TopNav } from './TopNav';
import type { UserRole } from '@/types/layout';
import type { User } from '@/types/auth';
import { useNotificationStore } from '@/stores/notification';

const { Sider, Content } = Layout;

interface MenuConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

const MENU_CONFIG: Record<UserRole, MenuConfig[]> = {
  sales: [
    { key: 'customers', label: '客户管理', icon: <TeamOutlined />, path: '/sales/customers' },
    { key: 'contracts', label: '销售合同', icon: <FileTextOutlined />, path: '/sales/contracts' },
    { key: 'shipments', label: '运输', icon: <CarOutlined />, path: '/sales/shipments' },
    { key: 'invoices', label: '发票', icon: <FileDoneOutlined />, path: '/sales/invoices' },
    { key: 'receipts', label: '收款', icon: <DollarOutlined />, path: '/sales/receipts' },
    { key: 'services', label: '服务合同', icon: <FileTextOutlined />, path: '/sales/services' },
    { key: 'bidding', label: '投标管理', icon: <FileTextOutlined />, path: '/sales/bidding' },
    { key: 'notifications', label: '通知中心', icon: <BellOutlined />, path: '/sales/notifications' },
  ],
  purchasing: [
    { key: 'suppliers', label: '供应商管理', icon: <TeamOutlined />, path: '/purchase/suppliers' },
    { key: 'contracts', label: '采购合同', icon: <FileTextOutlined />, path: '/purchase/contracts' },
    { key: 'arrivals', label: '运输', icon: <InboxOutlined />, path: '/purchase/arrivals' },
    { key: 'invoices', label: '收票', icon: <FileDoneOutlined />, path: '/purchase/invoices' },
    { key: 'payments', label: '付款', icon: <BankOutlined />, path: '/purchase/payments' },
    { key: 'expenses', label: '资金支出', icon: <DollarOutlined />, path: '/purchase/expenses' },
    { key: 'notifications', label: '通知中心', icon: <BellOutlined />, path: '/purchase/notifications' },
  ],
  manager: [
    { key: 'overview', label: '关联合同总览', icon: <LinkOutlined />, path: '/manager/overview' },
    { key: 'progress-flow', label: '流程进度', icon: <ShareAltOutlined />, path: '/manager/progress-flow' },
    { key: 'reports', label: '数据报表', icon: <BarChartOutlined />, path: '/manager/reports' },
    { key: 'performance', label: '业绩统计', icon: <TeamOutlined />, path: '/manager/performance' },
  ],
};

interface MainLayoutProps {
  user: User;
  children?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ user, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const { unreadCount, fetchUnreadCount } = useNotificationStore();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 767);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (user.type === 'purchasing' || user.type === 'sales') {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user.type, fetchUnreadCount]);

  const menuItems = MENU_CONFIG[user.type] || [];

  const findSelectedKey = (): string => {
    const currentPath = location.pathname;
    for (const item of menuItems) {
      if (currentPath.startsWith(item.path)) {
        return item.key;
      }
    }
    return menuItems[0]?.key || '';
  };

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const item = menuItems.find((m) => m.key === key);
    if (item) {
      navigate(item.path);
      if (isMobile) {
        setSidebarVisible(false);
      }
    }
  };

  const renderMenu = () => (
    <Menu
      mode="inline"
      selectedKeys={[findSelectedKey()]}
      style={{ 
        borderRight: 0, 
        background: 'transparent',
      }}
      items={menuItems.map((item) => ({
        key: item.key,
        label: item.key === 'notifications' && unreadCount > 0 ? (
          <Badge count={unreadCount} offset={[10, 0]}>
            {item.label}
          </Badge>
        ) : item.label,
        icon: item.icon,
      }))}
      onClick={handleMenuClick}
    />
  );

  const renderSidebar = () => (
    <>
      {isMobile ? (
        <Drawer
          placement="left"
          onClose={() => setSidebarVisible(false)}
          open={sidebarVisible}
          width={280}
          styles={{ body: { padding: 0, background: 'linear-gradient(180deg, #d8d9da 0%, #eaecec 40%, #ffffff 100%)' } }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
              采购销售系统
            </h2>
          </div>
          {renderMenu()}
        </Drawer>
      ) : (
        <Sider
          width={280}
          style={{
            background: 'linear-gradient(180deg, #d8d9da 0%, #eaecec 40%, #ffffff 100%)',
            borderRight: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
              采购销售系统
            </h2>
          </div>
          {renderMenu()}
        </Sider>
      )}
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {renderSidebar()}
      <Layout>
        <TopNav
          user={user}
          onMenuToggle={isMobile ? () => setSidebarVisible(true) : undefined}
        />
        <Content
          style={{
            margin: isMobile ? 16 : 24,
            padding: isMobile ? 16 : 24,
            background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 25%, #ffffff 50%, #f0f0f0 75%, #ffffff 100%)',
            borderRadius: 16,
            boxShadow: 
              '-8px -8px 16px rgba(255, 255, 255, 0.8), ' +
              '8px 8px 16px rgba(0, 0, 0, 0.1), ' +
              'inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
            minHeight: 280,
          }}
        >
          {children || <Outlet />}
        </Content>
      </Layout>
    </Layout>
  );
};
