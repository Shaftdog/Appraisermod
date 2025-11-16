import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import MuxPlayer from '@mux/mux-player-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  MessageSquare,
  FileText,
  Wrench,
} from 'lucide-react';

export default function LessonViewer() {
  const { courseSlug, lessonId } = useParams();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<any>(null);

  const { data: course } = useQuery({
    queryKey: [`/api/courses/${courseSlug}`],
  });

  const { data: lesson } = useQuery({
    queryKey: [`/api/lessons/${lessonId}`],
    enabled: !!lessonId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: [`/api/lessons/${lessonId}/comments`],
    enabled: !!lessonId,
  });

  const { data: progress } = useQuery({
    queryKey: [`/api/courses/${course?.id}/progress`],
    enabled: !!course?.id,
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async ({ percentComplete, watchTimeSeconds }: any) => {
      const res = await fetch(`/api/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentComplete, watchTimeSeconds }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/courses/${course?.id}/progress`] });
    },
  });

  // Track progress every 10 seconds
  useEffect(() => {
    if (!lesson || duration === 0) return;

    const interval = setInterval(() => {
      if (currentTime > 0) {
        const percentComplete = Math.min(Math.floor((currentTime / duration) * 100), 100);
        updateProgressMutation.mutate({
          percentComplete,
          watchTimeSeconds: Math.floor(currentTime),
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentTime, duration, lesson]);

  // Find current lesson in course structure
  const currentModuleIndex = course?.modules?.findIndex((m: any) =>
    m.lessons?.some((l: any) => l.id === lessonId)
  );
  const currentModule = course?.modules?.[currentModuleIndex];
  const currentLessonIndex = currentModule?.lessons?.findIndex((l: any) => l.id === lessonId);

  // Navigation
  const previousLesson = (() => {
    if (currentLessonIndex > 0) {
      return currentModule.lessons[currentLessonIndex - 1];
    }
    if (currentModuleIndex > 0) {
      const prevModule = course.modules[currentModuleIndex - 1];
      return prevModule.lessons[prevModule.lessons.length - 1];
    }
    return null;
  })();

  const nextLesson = (() => {
    if (currentLessonIndex < currentModule?.lessons?.length - 1) {
      return currentModule.lessons[currentLessonIndex + 1];
    }
    if (currentModuleIndex < course?.modules?.length - 1) {
      const nextModule = course.modules[currentModuleIndex + 1];
      return nextModule.lessons[0];
    }
    return null;
  })();

  if (!lesson || !course) {
    return <div>Loading...</div>;
  }

  const lessonProgress = progress?.modules
    ?.flatMap((m: any) => m.lessons)
    ?.find((l: any) => l.id === lessonId)?.progress;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href={`/courses/${courseSlug}`} className="flex items-center gap-2 hover:underline">
            <ChevronLeft className="w-4 h-4" />
            Back to {course.title}
          </Link>
          <div className="flex items-center gap-4">
            {lessonProgress?.isCompleted && (
              <Badge variant="success" className="gap-1">
                <CheckCircle className="w-3 h-3" />
                Completed
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video player */}
            {lesson.muxPlaybackId ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <MuxPlayer
                  ref={playerRef}
                  playbackId={lesson.muxPlaybackId}
                  metadata={{
                    video_title: lesson.title,
                    viewer_user_id: 'user-id',
                  }}
                  onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
                  onLoadedMetadata={(e: any) => setDuration(e.target.duration)}
                  streamType="on-demand"
                  primaryColor="#3b82f6"
                  accentColor="#60a5fa"
                />
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">No video available</p>
              </div>
            )}

            {/* Lesson info */}
            <div>
              <h1 className="text-3xl font-bold mb-2">{lesson.title}</h1>
              {lesson.description && (
                <p className="text-muted-foreground">{lesson.description}</p>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">
                  <FileText className="w-4 h-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="discussion">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Discussion ({comments.length})
                </TabsTrigger>
                <TabsTrigger value="tools">
                  <Wrench className="w-4 h-4 mr-2" />
                  Tools
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {lesson.content ? (
                  <Card>
                    <CardContent className="pt-6 prose prose-sm max-w-none">
                      {lesson.content}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-6 text-muted-foreground">
                      No lesson content available
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="discussion">
                <DiscussionPanel lessonId={lessonId!} comments={comments} />
              </TabsContent>

              <TabsContent value="tools">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground">
                      Practice what you learned with these tools
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              {previousLesson ? (
                <Button variant="outline" asChild>
                  <Link href={`/courses/${courseSlug}/lessons/${previousLesson.id}`}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Link>
                </Button>
              ) : (
                <div />
              )}
              {nextLesson ? (
                <Button asChild>
                  <Link href={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              ) : (
                <Button disabled>Course Complete</Button>
              )}
            </div>
          </div>

          {/* Sidebar - Course outline */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Course Content</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <div className="p-4 space-y-4">
                    {course.modules?.map((module: any, moduleIdx: number) => (
                      <div key={module.id}>
                        <h3 className="font-semibold mb-2">
                          {moduleIdx + 1}. {module.title}
                        </h3>
                        <div className="space-y-1 ml-4">
                          {module.lessons?.map((l: any, lessonIdx: number) => {
                            const lProgress = progress?.modules
                              ?.find((m: any) => m.id === module.id)
                              ?.lessons?.find((pl: any) => pl.id === l.id)?.progress;

                            return (
                              <Link
                                key={l.id}
                                href={`/courses/${courseSlug}/lessons/${l.id}`}
                                className={`flex items-center gap-2 p-2 rounded hover:bg-accent text-sm ${
                                  l.id === lessonId ? 'bg-accent' : ''
                                }`}
                              >
                                {lProgress?.isCompleted ? (
                                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border-2 border-muted flex-shrink-0" />
                                )}
                                <span className="flex-1">{l.title}</span>
                                {l.durationSeconds && (
                                  <span className="text-xs text-muted-foreground flex-shrink-0">
                                    {Math.floor(l.durationSeconds / 60)}m
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                        {moduleIdx < course.modules.length - 1 && <Separator className="mt-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscussionPanel({ lessonId, comments }: any) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const postCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/lessons/${lessonId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/comments`] });
      setNewComment('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Post new comment */}
      <Card>
        <CardContent className="pt-6">
          <Textarea
            placeholder="Ask a question or share your thoughts..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={3}
          />
          <Button
            className="mt-2"
            onClick={() => postCommentMutation.mutate(newComment)}
            disabled={!newComment.trim()}
          >
            Post Comment
          </Button>
        </CardContent>
      </Card>

      {/* Comments list */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No comments yet. Be the first to start a discussion!
            </CardContent>
          </Card>
        ) : (
          comments.map((comment: any) => (
            <Card key={comment.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{comment.user?.fullName || 'Anonymous'}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                      {comment.isEdited && (
                        <Badge variant="outline" className="text-xs">
                          Edited
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
