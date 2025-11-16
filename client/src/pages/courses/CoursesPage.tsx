import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Clock, CheckCircle, Play, Lock } from 'lucide-react';

export default function CoursesPage() {
  const { data: courses = [] } = useQuery({
    queryKey: ['/api/courses?published=true'],
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['/api/billing/enrollments'],
  });

  const { data: user } = useQuery({ queryKey: ['/api/auth/me'] });

  const enrolledCourseIds = new Set(enrollments.map((e: any) => e.productId));

  const enrolledCourses = courses.filter((c: any) => enrolledCourseIds.has(c.productId));
  const availableCourses = courses.filter((c: any) => !enrolledCourseIds.has(c.productId));

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Courses</h1>
        <p className="text-muted-foreground">
          Master real estate appraisal with expert-led video courses
        </p>
      </div>

      <Tabs defaultValue="my-courses">
        <TabsList>
          <TabsTrigger value="my-courses">My Courses</TabsTrigger>
          <TabsTrigger value="browse">Browse All</TabsTrigger>
        </TabsList>

        <TabsContent value="my-courses" className="mt-6">
          {enrolledCourses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No courses yet</h3>
                <p className="text-muted-foreground mb-4">Browse available courses to get started</p>
                <Button asChild>
                  <Link href="/courses?tab=browse">Browse Courses</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrolledCourses.map((course: any) => (
                <EnrolledCourseCard key={course.id} course={course} userId={user?.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="browse" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableCourses.map((course: any) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EnrolledCourseCard({ course, userId }: any) {
  const { data: progress } = useQuery({
    queryKey: [`/api/courses/${course.id}/progress`],
    enabled: !!userId,
  });

  const percentComplete = progress?.stats?.percentComplete || 0;
  const totalLessons = progress?.stats?.totalLessons || 0;
  const completedLessons = progress?.stats?.completedLessons || 0;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mb-4"></div>
        <CardTitle>{course.title}</CardTitle>
        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{percentComplete}%</span>
            </div>
            <Progress value={percentComplete} />
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <CheckCircle className="w-4 h-4" />
              <span>
                {completedLessons} / {totalLessons} lessons
              </span>
            </div>
            {progress?.stats?.totalWatchTime && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{Math.floor(progress.stats.totalWatchTime / 60)} min</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/courses/${course.slug}`}>
            <Play className="w-4 h-4 mr-2" />
            {percentComplete > 0 ? 'Continue Learning' : 'Start Course'}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function CourseCard({ course }: any) {
  const totalLessons = course.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0;
  const totalDuration = course.durationMinutes || 0;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="aspect-video bg-gradient-to-br from-green-500 to-teal-600 rounded-lg mb-4"></div>
        <CardTitle>{course.title}</CardTitle>
        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            <span>{totalLessons} lessons</span>
          </div>
          {totalDuration > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{Math.floor(totalDuration / 60)}h {totalDuration % 60}m</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{course.level || 'Beginner'}</Badge>
          {course.modules?.length && (
            <Badge variant="outline">{course.modules.length} modules</Badge>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/courses/${course.slug}/enroll`}>
            <Lock className="w-4 h-4 mr-2" />
            Enroll Now
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
