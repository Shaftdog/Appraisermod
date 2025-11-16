import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen,
  Clock,
  CheckCircle,
  Star,
  Users,
  Play,
  Lock,
  TrendingUp,
  Award,
} from 'lucide-react';

export default function CourseDetail() {
  const { slug } = useParams();
  const [, navigate] = useLocation();

  const { data: course } = useQuery({
    queryKey: [`/api/courses/${slug}`],
  });

  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['/api/billing/enrollments'],
    enabled: !!user,
  });

  const isEnrolled = enrollments.some((e: any) => e.productId === course?.productId);

  if (!course) {
    return <div>Loading...</div>;
  }

  const totalLessons = course.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0;
  const totalDuration = course.durationMinutes || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">
                {course.level || 'Beginner'}
              </Badge>
              <h1 className="text-5xl font-bold mb-4">{course.title}</h1>
              <p className="text-xl text-blue-100 mb-6">{course.description}</p>

              <div className="flex items-center gap-6 mb-8">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  <span>{totalLessons} lessons</span>
                </div>
                {totalDuration > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    <span>{Math.floor(totalDuration / 60)}h {totalDuration % 60}m</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <span>1,234 students</span>
                </div>
              </div>

              {isEnrolled ? (
                <Button size="lg" onClick={() => navigate(`/courses/${slug}/lessons`)}>
                  <Play className="w-5 h-5 mr-2" />
                  Continue Learning
                </Button>
              ) : (
                <EnrollButton course={course} />
              )}
            </div>

            <div className="aspect-video bg-black/20 rounded-xl overflow-hidden">
              {/* Preview video or thumbnail */}
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-20 h-20 opacity-80" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Course content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* What you'll learn */}
            <Card>
              <CardHeader>
                <CardTitle>What You'll Learn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    'Master real estate appraisal fundamentals',
                    'Understand market analysis techniques',
                    'Learn comp selection strategies',
                    'Practice with real-world examples',
                    'Build professional appraisal reports',
                    'Get certified completion badge',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Course curriculum */}
            <Card>
              <CardHeader>
                <CardTitle>Course Curriculum</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {course.modules?.map((module: any, idx: number) => (
                    <AccordionItem key={module.id} value={module.id}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-semibold">
                            {idx + 1}. {module.title}
                          </span>
                          <Badge variant="outline" className="ml-auto mr-2">
                            {module.lessons?.length || 0} lessons
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-4">
                          {module.lessons?.map((lesson: any, lessonIdx: number) => (
                            <div
                              key={lesson.id}
                              className="flex items-center justify-between py-2 border-b last:border-0"
                            >
                              <div className="flex items-center gap-3">
                                {isEnrolled ? (
                                  <Play className="w-4 h-4 text-blue-500" />
                                ) : (
                                  <Lock className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-sm">{lesson.title}</span>
                              </div>
                              {lesson.durationSeconds && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.floor(lesson.durationSeconds / 60)}:{(lesson.durationSeconds % 60)
                                    .toString()
                                    .padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            {/* Instructor section (placeholder) */}
            <Card>
              <CardHeader>
                <CardTitle>Your Instructor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                  <div>
                    <h3 className="font-semibold text-lg">Expert Appraiser</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      20+ years of real estate appraisal experience
                    </p>
                    <p className="text-sm">
                      Certified residential appraiser with extensive experience in market analysis,
                      property valuation, and appraisal report writing.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="pt-6">
                {!isEnrolled && (
                  <>
                    <div className="text-center mb-6">
                      <div className="text-4xl font-bold mb-2">$299</div>
                      <p className="text-sm text-muted-foreground">One-time payment</p>
                    </div>
                    <EnrollButton course={course} className="w-full mb-4" />
                    <Separator className="my-4" />
                  </>
                )}

                <div className="space-y-4">
                  <h3 className="font-semibold">This course includes:</h3>
                  <div className="space-y-3">
                    <Feature icon={<Play />} text={`${totalLessons} video lessons`} />
                    <Feature icon={<BookOpen />} text="Downloadable resources" />
                    <Feature icon={<Award />} text="Certificate of completion" />
                    <Feature icon={<Clock />} text="Lifetime access" />
                    <Feature icon={<TrendingUp />} text="Practice exercises" />
                    <Feature icon={<Users />} text="Community discussions" />
                  </div>
                </div>

                {!isEnrolled && (
                  <>
                    <Separator className="my-6" />
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">30-day money-back guarantee</p>
                      <div className="flex items-center justify-center gap-1 text-yellow-500">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-current" />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">4.9/5 rating (1,234 reviews)</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: any) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-green-500">{icon}</div>
      <span>{text}</span>
    </div>
  );
}

function EnrollButton({ course, className = '' }: any) {
  const [loading, setLoading] = useState(false);

  const createCheckoutMutation = useMutation({
    mutationFn: async () => {
      setLoading(true);
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: course.product?.stripePriceId,
          productId: course.productId,
        }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      setLoading(false);
    },
  });

  return (
    <Button
      size="lg"
      className={className}
      onClick={() => createCheckoutMutation.mutate()}
      disabled={loading}
    >
      {loading ? 'Loading...' : 'Enroll Now'}
    </Button>
  );
}
