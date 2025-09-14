import { useParams, useLocation } from 'wouter';
import OrderSummary from './order-summary';
import Subject from './subject';
import Market from './market';
import Comps from './comps';
import Sketch from './sketch';
import Photos from './photos';
import Cost from './cost';
import Reconciliation from './reconciliation';
import Activity from './activity';
import QcSignoff from './qc-signoff';
import Exports from './exports';
import OrderLayout from './layout';

export default function OrderPage() {
  const [location] = useLocation();
  const params = useParams<{ orderId: string }>();
  
  const pathSegments = location.split('/');
  const currentTab = pathSegments[pathSegments.length - 1];
  
  const renderTabContent = () => {
    switch (currentTab) {
      case 'subject':
        return <Subject />;
      case 'market':
        return <Market />;
      case 'comps':
        return <Comps />;
      case 'sketch':
        return <Sketch />;
      case 'photos':
        return <Photos />;
      case 'cost':
        return <Cost />;
      case 'reconciliation':
        return <Reconciliation />;
      case 'activity':
        return <Activity />;
      case 'qc-signoff':
        return <QcSignoff />;
      case 'exports':
        return <Exports />;
      default:
        return <OrderSummary />;
    }
  };

  return (
    <OrderLayout>
      {renderTabContent()}
    </OrderLayout>
  );
}
