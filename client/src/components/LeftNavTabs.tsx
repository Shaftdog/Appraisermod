import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import { StatusChip } from './StatusChip';
import { Order, TabKey, TAB_LABELS } from '@/types';
import { aggregateStatus } from '@/lib/aggregateStatus';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface LeftNavTabsProps {
  order: Order;
}

export function LeftNavTabs({ order }: LeftNavTabsProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  const currentTab = location.split('/').pop() || 'order-summary';
  const orderId = order.id;

  const tabKeys: TabKey[] = [
    'orderSummary',
    'subject', 
    'market',
    'comps',
    'sketch',
    'photos',
    'cost',
    'reconciliation',
    'qcSignoff',
    'exports'
  ];

  const overallStatus = aggregateStatus(
    Object.values(order.tabs).map(tab => tab.qc.status)
  );

  const getTabPath = (tabKey: TabKey) => {
    if (tabKey === 'orderSummary') {
      return `/orders/${orderId}`;
    }
    return `/orders/${orderId}/${tabKey.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
  };

  const closeMobileNav = () => setIsOpen(false);

  if (isMobile) {
    return (
      <>
        {/* Mobile Header */}
        <header className="lg:hidden bg-card border-b border-border p-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setIsOpen(true)}
              className="p-2 hover:bg-muted rounded-md"
              data-testid="button-open-sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold" data-testid="text-order-number">
              Order #{order.orderNumber}
            </h1>
            <div className="w-10" />
          </div>
        </header>

        {/* Mobile Overlay */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={closeMobileNav}
            data-testid="overlay-mobile-menu"
          />
        )}

        {/* Mobile Sidebar */}
        <aside 
          className={cn(
            "fixed lg:static lg:translate-x-0 transition-transform duration-300 ease-in-out z-50 w-80 bg-card border-r border-border h-screen overflow-y-auto",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
          data-testid="sidebar-mobile"
        >
          <SidebarContent 
            order={order}
            tabKeys={tabKeys}
            currentTab={currentTab}
            overallStatus={overallStatus}
            getTabPath={getTabPath}
            onTabClick={closeMobileNav}
            showCloseButton={true}
            onClose={closeMobileNav}
          />
        </aside>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside 
      className="w-80 bg-card border-r border-border h-screen overflow-y-auto"
      data-testid="sidebar-desktop"
    >
      <SidebarContent 
        order={order}
        tabKeys={tabKeys}
        currentTab={currentTab}
        overallStatus={overallStatus}
        getTabPath={getTabPath}
      />
    </aside>
  );
}

interface SidebarContentProps {
  order: Order;
  tabKeys: TabKey[];
  currentTab: string;
  overallStatus: any;
  getTabPath: (tabKey: TabKey) => string;
  onTabClick?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

function SidebarContent({ 
  order, 
  tabKeys, 
  currentTab, 
  overallStatus, 
  getTabPath, 
  onTabClick,
  showCloseButton,
  onClose
}: SidebarContentProps) {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-foreground">Order Management</h1>
        {showCloseButton && (
          <button 
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-muted rounded-md"
            data-testid="button-close-sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {/* Order Info */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <h2 className="font-medium text-foreground mb-2" data-testid="text-order-title">
          Order #{order.orderNumber}
        </h2>
        <p className="text-sm text-muted-foreground mb-1" data-testid="text-client-name">
          {order.clientName}
        </p>
        {order.dueDate && (
          <p className="text-sm text-muted-foreground mb-3" data-testid="text-due-date">
            Due: {new Date(order.dueDate).toLocaleDateString()}
          </p>
        )}
        
        {/* Overall Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Overall Status:</span>
          <StatusChip 
            status={overallStatus}
            openIssues={Object.values(order.tabs).reduce((acc, tab) => acc + tab.qc.openIssues, 0)}
            overriddenIssues={Object.values(order.tabs).reduce((acc, tab) => acc + tab.qc.overriddenIssues, 0)}
          />
        </div>
      </div>
      
      {/* Navigation Tabs */}
      <nav className="space-y-1" role="tablist">
        {tabKeys.map((tabKey) => {
          const tab = order.tabs[tabKey];
          if (!tab) return null;

          const path = getTabPath(tabKey);
          const isActive = currentTab === (tabKey === 'orderSummary' ? '' : tabKey.replace(/([A-Z])/g, '-$1').toLowerCase());
          
          return (
            <Link 
              key={tabKey}
              href={path}
              onClick={onTabClick}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-foreground hover:bg-muted"
              )}
              data-testid={`tab-link-${tabKey}`}
            >
              <span className="font-medium">{TAB_LABELS[tabKey]}</span>
              <StatusChip
                status={tab.qc.status}
                openIssues={tab.qc.openIssues}
                overriddenIssues={tab.qc.overriddenIssues}
                lastReviewedBy={tab.qc.lastReviewedBy}
                lastReviewedAt={tab.qc.lastReviewedAt}
                className={isActive ? "bg-white/20" : ""}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
