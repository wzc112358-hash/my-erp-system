import React from 'react';
import { Layout, Space, Dropdown, Avatar, Button } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import type { User } from '@/types/auth';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

const { Header } = Layout;

interface TopNavProps {
  user: User;
  onMenuToggle?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ user, onMenuToggle }) => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  const getRoleLabel = (type: string): string => {
    const roleMap: Record<string, string> = {
      sales: '销售职员',
      purchasing: '采购职员',
      manager: '经理',
    };
    return roleMap[type] || '用户';
  };

  return (
    <Header
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f8f8 50%, #ffffff 100%)',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        height: 64,
        boxShadow: '-4px -4px 8px rgba(255, 255, 255, 0.8), 0 2px 8px rgba(0, 0, 0, 0.08)',
      }}
    >
      <Space size={16} style={{ width: '100%', justifyContent: 'space-between' }}>
        {onMenuToggle && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onMenuToggle}
          />
        )}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar 
              icon={!user.avatar ? <UserOutlined /> : undefined} 
              src={user.avatar || null}
              style={{ 
                boxShadow: '-2px -2px 4px rgba(255, 255, 255, 0.1), 2px 2px 4px rgba(0, 0, 0, 0.1)',
              }}
            />
            <span style={{ color: '#333', fontWeight: 500 }}>{user.name}</span>
            <span
              style={{
                color: '#999',
                fontSize: 12,
                padding: '2px 8px',
                background: '#f5f5f5',
                borderRadius: 4,
              }}
            >
              {getRoleLabel(user.type)}
            </span>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};
