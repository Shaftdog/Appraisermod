import { useQuery } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { LeftNavTabs } from '@/components/LeftNavTabs';
import { Order } from '@/types';

interface OrderLayoutProps {
  children: React.ReactNode;
}

export default function OrderLayout({ children }: OrderLayoutProps) {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;

  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load order</p>
          <p className="text-muted-foreground">Order not found or an error occurred</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <LeftNavTabs order={order} />
      <main className="flex-1 lg:ml-0">
        {children}
      </main>
    </div>
  );
}
