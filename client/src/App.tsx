import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ReviewerDashboard } from "@/pages/ReviewerDashboard";
import { OrderReview } from "@/pages/OrderReview";
import NotFound from "@/pages/not-found";
import OrderPage from "@/pages/orders/[orderId]";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/" component={() => <Redirect to="/orders/order-123" />} />
      
      {/* Reviewer Routes */}
      <Route path="/reviewer" component={() => (
        <ProtectedRoute>
          <ReviewerDashboard />
        </ProtectedRoute>
      )} />
      <Route path="/reviewer/orders/:orderId" component={() => (
        <ProtectedRoute>
          <OrderReview />
        </ProtectedRoute>
      )} />
      
      {/* Order Routes */}
      <Route path="/orders/:orderId/:tab?" component={() => (
        <ProtectedRoute>
          <OrderPage />
        </ProtectedRoute>
      )} />
      <Route path="/orders/:orderId" component={() => (
        <ProtectedRoute>
          <OrderPage />
        </ProtectedRoute>
      )} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
