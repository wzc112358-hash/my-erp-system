import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
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
          borderRadius: 12,
          fontFamily: 'Inter, PingFang SC, Helvetica, sans-serif',
        },
        components: {
          Button: {
            borderRadius: 12,
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
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
