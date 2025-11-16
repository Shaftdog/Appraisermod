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
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/not-found";
import OrderPage from "@/pages/orders/[orderId]";
import MarketEnhancedPage from "@/pages/orders/[orderId]/market-enhanced";

// Course platform pages
import CoursesPage from "@/pages/courses/CoursesPage";
import CourseDetail from "@/pages/courses/CourseDetail";
import LessonViewer from "@/pages/courses/LessonViewer";
import Dashboard from "@/pages/courses/Dashboard";
import CourseBuilder from "@/pages/courses/admin/CourseBuilder";
import AdminAnalytics from "@/pages/courses/AdminAnalytics";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/" component={() => <Redirect to="/orders/order-123" />} />
      
      {/* Admin Routes */}
      <Route path="/admin" component={() => (
        <ProtectedRoute>
          <AdminPage />
        </ProtectedRoute>
      )} />
      
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
      
      {/* Course Platform Routes */}
      <Route path="/dashboard" component={() => (
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      )} />
      <Route path="/courses" component={() => (
        <ProtectedRoute>
          <CoursesPage />
        </ProtectedRoute>
      )} />
      <Route path="/courses/:slug" component={() => (
        <ProtectedRoute>
          <CourseDetail />
        </ProtectedRoute>
      )} />
      <Route path="/courses/:courseSlug/lessons/:lessonId" component={() => (
        <ProtectedRoute>
          <LessonViewer />
        </ProtectedRoute>
      )} />
      <Route path="/admin/courses" component={() => (
        <ProtectedRoute>
          <CourseBuilder />
        </ProtectedRoute>
      )} />
      <Route path="/admin/analytics" component={() => (
        <ProtectedRoute>
          <AdminAnalytics />
        </ProtectedRoute>
      )} />

      {/* Order Routes */}
      {/* Enhanced Market Analysis - must come before generic :tab route */}
      <Route path="/orders/:orderId/market-enhanced" component={() => (
        <ProtectedRoute>
          <MarketEnhancedPage />
        </ProtectedRoute>
      )} />
      
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
