import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from '@/contexts/AuthContext';
import { router } from '@/routes';

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1A1A1A',
          colorBgContainer: '#FFFFFF',
          colorText: '#333333',
          colorTextSecondary: '#999999',
          colorBgLayout: '#FFFFFF',
          borderRadius: 8,
          fontFamily: 'Inter, PingFang SC, Helvetica, sans-serif',
        },
        components: {
          Button: {
            borderRadius: 8,
            primaryShadow: 'none',
          },
          Table: {
            borderRadius: 12,
          },
          Card: {
            borderRadiusLG: 12,
          },
        },
      }}
    >
      <AntApp>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
