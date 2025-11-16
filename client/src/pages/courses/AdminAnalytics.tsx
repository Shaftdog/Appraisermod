import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, BookOpen, DollarSign, Clock, Award, MessageSquare, Play } from 'lucide-react';

export default function AdminAnalytics() {
  const { data: courses = [] } = useQuery({ queryKey: ['/api/courses'] });
  const { data: enrollments = [] } = useQuery({ queryKey: ['/api/billing/enrollments'] });

  // Mock analytics data (in real app, would come from API)
  const revenueData = [
    { month: 'Jan', revenue: 4500 },
    { month: 'Feb', revenue: 5200 },
    { month: 'Mar', revenue: 6800 },
    { month: 'Apr', revenue: 7200 },
    { month: 'May', revenue: 8500 },
    { month: 'Jun', revenue: 9800 },
  ];

  const enrollmentData = [
    { month: 'Jan', enrollments: 12 },
    { month: 'Feb', enrollments: 18 },
    { month: 'Mar', enrollments: 25 },
    { month: 'Apr', enrollments: 29 },
    { month: 'May', enrollments: 35 },
    { month: 'Jun', enrollments: 42 },
  ];

  const completionData = [
    { course: 'Appraiser Secrets', completed: 65, inProgress: 35 },
    { course: 'Market Analysis', completed: 78, inProgress: 22 },
    { course: 'Advanced Comps', completed: 45, inProgress: 55 },
  ];

  const engagementData = [
    { name: 'Video Views', value: 1234 },
    { name: 'Comments', value: 456 },
    { name: 'Tools Used', value: 789 },
  ];

  const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe'];

  // Calculate stats
  const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
  const totalEnrollments = enrollments.length;
  const activeCourses = courses.filter((c: any) => c.isPublished).length;
  const avgCompletionRate = 65; // Mock

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Track course performance and student engagement</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          change="+15.3%"
          positive
        />
        <MetricCard
          icon={<Users className="w-5 h-5" />}
          label="Total Students"
          value={totalEnrollments}
          change="+23 this month"
          positive
        />
        <MetricCard
          icon={<BookOpen className="w-5 h-5" />}
          label="Active Courses"
          value={activeCourses}
          change="3 published"
        />
        <MetricCard
          icon={<Award className="w-5 h-5" />}
          label="Avg Completion"
          value={`${avgCompletionRate}%`}
          change="+5.2%"
          positive
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#667eea" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Enrollment Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Student Growth</CardTitle>
                <CardDescription>New enrollments per month</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={enrollmentData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="enrollments" fill="#764ba2" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ActivityItem
                  icon={<Users className="w-4 h-4" />}
                  text="New student enrolled in Appraiser Secrets"
                  time="2 minutes ago"
                />
                <ActivityItem
                  icon={<MessageSquare className="w-4 h-4" />}
                  text="15 new comments posted today"
                  time="1 hour ago"
                />
                <ActivityItem
                  icon={<Award className="w-4 h-4" />}
                  text="3 students completed courses"
                  time="3 hours ago"
                />
                <ActivityItem
                  icon={<Play className="w-4 h-4" />}
                  text="234 video lessons watched today"
                  time="5 hours ago"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Month</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#667eea" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Average Order Value</span>
                      <span className="font-semibold">$299</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Conversion Rate</span>
                      <span className="font-semibold">4.2%</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Refund Rate</span>
                      <span className="font-semibold">1.8%</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">MRR (Monthly Recurring)</span>
                      <span className="font-semibold">$9,800</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={engagementData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {engagementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <StatRow label="Total Video Views" value="12,345" icon={<Play />} />
                  <StatRow label="Avg Watch Time" value="45 min/day" icon={<Clock />} />
                  <StatRow label="Total Comments" value="1,234" icon={<MessageSquare />} />
                  <StatRow label="Tools Used" value="789" icon={<Award />} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="courses">
          <Card>
            <CardHeader>
              <CardTitle>Course Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={completionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="course" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" fill="#667eea" name="Completed" />
                  <Bar dataKey="inProgress" fill="#764ba2" name="In Progress" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon, label, value, change, positive }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className={`text-xs mt-1 ${positive ? 'text-green-600' : 'text-muted-foreground'}`}>
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityItem({ icon, text, time }: any) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b last:border-0">
      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm">{text}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}

function StatRow({ label, value, icon }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-accent rounded-lg">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
