import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import type { UserRole } from '@/types/auth';
import React, { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import { MainLayout } from '@/layouts/MainLayout';

const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })));
const SystemSelect = lazy(() => import('@/pages/SystemSelect').then(m => ({ default: m.default })));
const CustomerList = lazy(() => import('@/pages/sales/customers/CustomerList').then(m => ({ default: m.CustomerList })));
const CustomerDetail = lazy(() => import('@/pages/sales/customers/CustomerDetail').then(m => ({ default: m.CustomerDetail })));
const ContractList = lazy(() => import('@/pages/sales/contracts/ContractList').then(m => ({ default: m.ContractList })));
const ContractDetail = lazy(() => import('@/pages/sales/contracts/ContractDetail').then(m => ({ default: m.ContractDetail })));
const ShipmentList = lazy(() => import('@/pages/sales/shipments/ShipmentList').then(m => ({ default: m.ShipmentList })));
const ShipmentDetail = lazy(() => import('@/pages/sales/shipments/ShipmentDetail').then(m => ({ default: m.ShipmentDetail })));
const InvoiceList = lazy(() => import('@/pages/sales/invoices/InvoiceList').then(m => ({ default: m.InvoiceList })));
const InvoiceDetail = lazy(() => import('@/pages/sales/invoices/InvoiceDetail').then(m => ({ default: m.InvoiceDetail })));
const ReceiptList = lazy(() => import('@/pages/sales/receipts/ReceiptList').then(m => ({ default: m.ReceiptList })));
const ReceiptDetailPage = lazy(() => import('@/pages/sales/receipts/ReceiptDetailPage').then(m => ({ default: m.ReceiptDetailPage })));
const SupplierList = lazy(() => import('@/pages/purchase/suppliers/SupplierList').then(m => ({ default: m.SupplierList })));
const SupplierDetail = lazy(() => import('@/pages/purchase/suppliers/SupplierDetail').then(m => ({ default: m.SupplierDetail })));
const PurchaseContractList = lazy(() => import('@/pages/purchase/contracts/ContractList').then(m => ({ default: m.ContractList })));
const PurchaseContractDetail = lazy(() => import('@/pages/purchase/contracts/ContractDetail').then(m => ({ default: m.ContractDetail })));
const ArrivalList = lazy(() => import('@/pages/purchase/arrivals/ArrivalList').then(m => ({ default: m.ArrivalList })));
const ArrivalDetail = lazy(() => import('@/pages/purchase/arrivals/ArrivalDetail').then(m => ({ default: m.ArrivalDetail })));
const PurchaseInvoiceList = lazy(() => import('@/pages/purchase/invoices/InvoiceList').then(m => ({ default: m.InvoiceList })));
const PurchaseInvoiceDetail = lazy(() => import('@/pages/purchase/invoices/InvoiceDetail').then(m => ({ default: m.InvoiceDetail })));
const PaymentList = lazy(() => import('@/pages/purchase/payments/PaymentList').then(m => ({ default: m.PaymentList })));
const PaymentDetailPage = lazy(() => import('@/pages/purchase/payments/PaymentDetailPage').then(m => ({ default: m.PaymentDetailPage })));
const NotificationList = lazy(() => import('@/pages/purchase/notifications/NotificationList').then(m => ({ default: m.NotificationList })));
const ExpenseList = lazy(() => import('@/pages/purchase/expenses/ExpenseList').then(m => ({ default: m.ExpenseList })));
const ExpenseDetail = lazy(() => import('@/pages/purchase/expenses/ExpenseDetail').then(m => ({ default: m.ExpenseDetail })));
const SalesNotificationList = lazy(() => import('@/pages/sales/notifications/NotificationList').then(m => ({ default: m.NotificationList })));
const ReportPage = lazy(() => import('@/pages/manager/ReportPage').then(m => ({ default: m.ReportPage })));
const OverviewPage = lazy(() => import('@/pages/manager/OverviewPage').then(m => ({ default: m.default })));
const ContractDetailPage = lazy(() => import('@/pages/manager/ContractDetailPage').then(m => ({ default: m.default })));
const ProgressFlowPage = lazy(() => import('@/pages/manager/ProgressFlowPage').then(m => ({ default: m.ProgressFlowPage })));
const PerformancePage = lazy(() => import('@/pages/manager/PerformancePage').then(m => ({ default: m.default })));
const OtherBusinessPage = lazy(() => import('@/pages/manager/OtherBusinessPage').then(m => ({ default: m.default })));
const ExchangeRatePage = lazy(() => import('@/pages/manager/ExchangeRatePage').then(m => ({ default: m.ExchangeRatePage })));
const ServiceList = lazy(() => import('@/pages/sales/services/ServiceList').then(m => ({ default: m.ServiceList })));
const ServiceDetail = lazy(() => import('@/pages/sales/services/ServiceDetail').then(m => ({ default: m.ServiceDetail })));
const BiddingList = lazy(() => import('@/pages/sales/bidding/BiddingList').then(m => ({ default: m.BiddingList })));
const BiddingDetail = lazy(() => import('@/pages/sales/bidding/BiddingDetail').then(m => ({ default: m.BiddingDetail })));

// eslint-disable-next-line react-refresh/only-export-components
const LoadingFallback: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
    <Spin size="large" />
  </div>
);

// eslint-disable-next-line react-refresh/only-export-components
const ProtectedRoute: React.FC<{ allowedRoles?: UserRole[] }> = ({ allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();

  const erpSystem = localStorage.getItem('erp_system');
  if (!erpSystem) {
    return <Navigate to="/select-system" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.type)) {
    return <Navigate to="/" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <MainLayout user={user}>
      <Suspense fallback={<LoadingFallback />}>
        <Outlet />
      </Suspense>
    </MainLayout>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
const PublicRoute: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Outlet />
    </Suspense>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
const RootRedirect: React.FC = () => {
  const { user } = useAuthStore();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

switch (user.type) {
    case 'sales':
      return <Navigate to="/sales/customers" replace />;
    case 'purchasing':
      return <Navigate to="/purchase/suppliers" replace />;
    case 'manager':
      return <Navigate to="/manager/overview" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

export const router = createBrowserRouter([
  {
    path: '/select-system',
    element: <SystemSelect />,
  },
  {
    path: '/login',
    element: <PublicRoute />,
    children: [
      {
        index: true,
        element: <Login />,
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <RootRedirect />,
      },
      {
        path: '/sales',
        children: [
          {
            path: 'customers',
            element: <CustomerList />,
          },
          {
            path: 'customers/:id',
            element: <CustomerDetail />,
          },
          {
            path: 'contracts',
            element: <ContractList />,
          },
          {
            path: 'contracts/:id',
            element: <ContractDetail />,
          },
          {
            path: 'shipments',
            element: <ShipmentList />,
          },
          {
            path: 'shipments/:id',
            element: <ShipmentDetail />,
          },
          {
            path: 'invoices',
            element: <InvoiceList />,
          },
          {
            path: 'invoices/:id',
            element: <InvoiceDetail />,
          },
          {
            path: 'receipts',
            element: <ReceiptList />,
          },
          {
            path: 'receipts/:id',
            element: <ReceiptDetailPage />,
          },
          {
            path: 'notifications',
            element: <SalesNotificationList />,
          },
          {
            path: 'exchange-rate',
            element: <ExchangeRatePage />,
          },
          {
            path: 'services',
            element: <ServiceList />,
          },
          {
            path: 'services/:id',
            element: <ServiceDetail />,
          },
          {
            path: 'bidding',
            element: <BiddingList />,
          },
          {
            path: 'bidding/:id',
            element: <BiddingDetail />,
          },
        ],
      },
      {
        path: '/purchase',
        children: [
          {
            path: 'suppliers',
            element: <SupplierList />,
          },
          {
            path: 'suppliers/:id',
            element: <SupplierDetail />,
          },
          {
            path: 'contracts',
            element: <PurchaseContractList />,
          },
          {
            path: 'contracts/:id',
            element: <PurchaseContractDetail />,
          },
          {
            path: 'arrivals',
            element: <ArrivalList />,
          },
          {
            path: 'arrivals/:id',
            element: <ArrivalDetail />,
          },
          {
            path: 'invoices',
            element: <PurchaseInvoiceList />,
          },
          {
            path: 'invoices/:id',
            element: <PurchaseInvoiceDetail />,
          },
          {
            path: 'payments',
            element: <PaymentList />,
          },
          {
            path: 'payments/:id',
            element: <PaymentDetailPage />,
          },
          {
            path: 'notifications',
            element: <NotificationList />,
          },
          {
            path: 'expenses',
            element: <ExpenseList />,
          },
          {
            path: 'expenses/:id',
            element: <ExpenseDetail />,
          },
          {
            path: 'exchange-rate',
            element: <ExchangeRatePage />,
          },
        ],
      },
{
        path: '/manager',
        children: [
          {
            path: 'overview',
            element: <OverviewPage />,
          },
          {
            path: 'overview/contract/:id',
            element: <ContractDetailPage />,
          },
          {
            path: 'overview/purchase/:id',
            element: <ContractDetailPage />,
          },
          {
            path: 'progress-flow',
            element: <ProgressFlowPage />,
          },
          {
            path: 'reports',
            element: <ReportPage />,
          },
          {
            path: 'performance',
            element: <PerformancePage />,
          },
          {
            path: 'other-business',
            element: <OtherBusinessPage />,
          },
          {
            path: 'exchange-rate',
            element: <ExchangeRatePage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
