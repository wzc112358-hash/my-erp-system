import type { UserRole } from './auth';

export type { UserRole };

export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  path: string;
  children?: MenuItem[];
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
}

export interface LayoutConfig {
  sidebarWidth: number;
  headerHeight: number;
  breakpoint: {
    mobile: number;
    tablet: number;
  };
}

export interface ThemeColors {
  primaryBg: string;
  textPrimary: string;
  textSecondary: string;
  selectedBg: string;
  buttonPrimary: string;
  buttonText: string;
}

export interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  sidebarCollapsed: boolean;
}

export const SALES_MENU_ITEMS: MenuItem[] = [
  { key: 'customers', label: '客户管理', path: '/sales/customers' },
  { key: 'contracts', label: '销售合同', path: '/sales/contracts' },
  { key: 'shipments', label: '发货', path: '/sales/shipments' },
  { key: 'invoices', label: '发票', path: '/sales/invoices' },
  { key: 'receipts', label: '收款', path: '/sales/receipts' },
  { key: 'progress', label: '进度跟踪', path: '/sales/progress' },
];

export const PURCHASE_MENU_ITEMS: MenuItem[] = [
  { key: 'suppliers', label: '供应商管理', path: '/purchase/suppliers' },
  { key: 'contracts', label: '采购合同', path: '/purchase/contracts' },
  { key: 'arrivals', label: '到货', path: '/purchase/arrivals' },
  { key: 'invoices', label: '收票', path: '/purchase/invoices' },
  { key: 'payments', label: '付款', path: '/purchase/payments' },
  { key: 'progress', label: '进度跟踪', path: '/purchase/progress' },
];

export const MANAGER_MENU_ITEMS: MenuItem[] = [
  { key: 'dashboard', label: '总览', path: '/manager/dashboard' },
  { key: 'progress', label: '进度跟踪', path: '/manager/progress' },
  { key: 'comparison', label: '关联对比', path: '/manager/comparison' },
  { key: 'reports', label: '数据报表', path: '/manager/reports' },
  { key: 'history', label: '历史记录', path: '/manager/history' },
];

export const getMenuItemsByRole = (role: UserRole): MenuItem[] => {
  switch (role) {
    case 'sales':
      return SALES_MENU_ITEMS;
    case 'purchasing':
      return PURCHASE_MENU_ITEMS;
    case 'manager':
      return MANAGER_MENU_ITEMS;
    default:
      return [];
  }
};
