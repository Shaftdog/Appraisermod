import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Trophy,
  Flame,
  BookOpen,
  Clock,
  Award,
  TrendingUp,
  Play,
  CheckCircle,
} from 'lucide-react';

export default function Dashboard() {
  const { data: user } = useQuery({ queryKey: ['/api/auth/me'] });
  const { data: enrollments = [] } = useQuery({ queryKey: ['/api/billing/enrollments'] });
  const { data: points } = useQuery({ queryKey: ['/api/gamification/points'] });
  const { data: badges = [] } = useQuery({ queryKey: ['/api/gamification/badges'] });
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['/api/gamification/leaderboard?period=week'],
  });

  const userRank = leaderboard.findIndex((entry: any) => entry.user?.id === user?.id) + 1;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.fullName}!</h1>
        <p className="text-muted-foreground">Continue your learning journey</p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          label="Enrolled Courses"
          value={enrollments.length}
          trend="+2 this month"
        />
        <StatCard
          icon={<Trophy className="w-5 h-5" />}
          label="Total Points"
          value={points?.total || 0}
          trend={userRank > 0 ? `#${userRank} this week` : ''}
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          label="Badges Earned"
          value={badges.length}
          trend=""
        />
        <StatCard
          icon={<Flame className="w-5 h-5" />}
          label="Day Streak"
          value={7}
          trend="Keep it up!"
        />
      </div>

      <Tabs defaultValue="continue" className="space-y-6">
        <TabsList>
          <TabsTrigger value="continue">Continue Learning</TabsTrigger>
          <TabsTrigger value="progress">My Progress</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="continue">
          <ContinueLearning enrollments={enrollments} />
        </TabsContent>

        <TabsContent value="progress">
          <MyProgress enrollments={enrollments} userId={user?.id} />
        </TabsContent>

        <TabsContent value="achievements">
          <Achievements badges={badges} points={points?.total || 0} leaderboard={leaderboard} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value, trend }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
      </CardContent>
    </Card>
  );
}

function ContinueLearning({ enrollments }: any) {
  if (enrollments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64">
          <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No courses enrolled</h3>
          <p className="text-muted-foreground mb-4">Start learning by enrolling in a course</p>
          <Button asChild>
            <Link href="/courses?tab=browse">Browse Courses</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {enrollments.map((enrollment: any) => (
        <CourseProgressCard key={enrollment.id} enrollment={enrollment} />
      ))}
    </div>
  );
}

function CourseProgressCard({ enrollment }: any) {
  const { data: course } = useQuery({
    queryKey: [`/api/courses/${enrollment.productId}`],
    enabled: !!enrollment.productId,
  });

  const { data: progress } = useQuery({
    queryKey: [`/api/courses/${enrollment.productId}/progress`],
    enabled: !!enrollment.productId,
  });

  if (!course || !progress) return null;

  const percentComplete = progress.stats?.percentComplete || 0;
  const nextLesson = progress.modules
    ?.flatMap((m: any) => m.lessons)
    ?.find((l: any) => !l.progress?.isCompleted);

  return (
    <Card>
      <CardHeader>
        <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mb-4" />
        <CardTitle>{course.title}</CardTitle>
        <CardDescription>
          {progress.stats.completedLessons} / {progress.stats.totalLessons} lessons completed
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{percentComplete}%</span>
            </div>
            <Progress value={percentComplete} />
          </div>

          {nextLesson && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Continue with:</p>
              <Button asChild className="w-full">
                <Link href={`/courses/${course.slug}/lessons/${nextLesson.id}`}>
                  <Play className="w-4 h-4 mr-2" />
                  {nextLesson.title}
                </Link>
              </Button>
            </div>
          )}

          {percentComplete === 100 && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Course Completed!</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MyProgress({ enrollments, userId }: any) {
  return (
    <div className="space-y-6">
      {enrollments.map((enrollment: any) => (
        <CourseProgressDetail key={enrollment.id} enrollment={enrollment} userId={userId} />
      ))}
    </div>
  );
}

function CourseProgressDetail({ enrollment, userId }: any) {
  const { data: course } = useQuery({
    queryKey: [`/api/courses/${enrollment.productId}`],
    enabled: !!enrollment.productId,
  });

  const { data: progress } = useQuery({
    queryKey: [`/api/courses/${enrollment.productId}/progress`],
    enabled: !!enrollment.productId,
  });

  if (!course || !progress) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{course.title}</CardTitle>
            <CardDescription>
              Started {new Date(enrollment.startedAt).toLocaleDateString()}
            </CardDescription>
          </div>
          <Badge variant={progress.stats.percentComplete === 100 ? 'success' : 'default'}>
            {progress.stats.percentComplete}% Complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Progress value={progress.stats.percentComplete} />

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{progress.stats.completedLessons}</div>
              <div className="text-sm text-muted-foreground">Lessons Done</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{Math.floor(progress.stats.totalWatchTime / 60)}</div>
              <div className="text-sm text-muted-foreground">Minutes Watched</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{progress.modules?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Modules</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Achievements({ badges, points, leaderboard, userId }: any) {
  const userRank = leaderboard.findIndex((entry: any) => entry.user?.id === userId) + 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Badges */}
      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
          <CardDescription>Unlock badges as you progress</CardDescription>
        </CardHeader>
        <CardContent>
          {badges.length === 0 ? (
            <p className="text-muted-foreground text-sm">No badges earned yet. Keep learning!</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {badges.map((userBadge: any) => (
                <div key={userBadge.id} className="text-center">
                  <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                    <Award className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-sm font-semibold">{userBadge.badge?.name}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>Top learners this week</CardDescription>
        </CardHeader>
        <CardContent>
          {userRank > 0 && (
            <div className="mb-4 p-3 bg-accent rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Your Rank</span>
                <Badge variant="secondary">#{userRank}</Badge>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {leaderboard.slice(0, 10).map((entry: any, index: number) => (
              <div
                key={entry.user?.id}
                className={`flex items-center justify-between p-2 rounded ${
                  entry.user?.id === userId ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-muted-foreground w-6">#{index + 1}</span>
                  <span className="font-medium">{entry.user?.fullName || 'Anonymous'}</span>
                </div>
                <span className="font-semibold">{entry.points} pts</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
