import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit, Video, Upload, Eye, EyeOff } from 'lucide-react';

export default function CourseBuilder() {
  const queryClient = useQueryClient();
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  // Fetch courses
  const { data: courses = [] } = useQuery({
    queryKey: ['/api/courses'],
  });

  // Create course mutation
  const createCourseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
    },
  });

  // Create module mutation
  const createModuleMutation = useMutation({
    mutationFn: async ({ courseId, data }: any) => {
      const res = await fetch(`/api/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
    },
  });

  // Create lesson mutation
  const createLessonMutation = useMutation({
    mutationFn: async ({ moduleId, data }: any) => {
      const res = await fetch(`/api/modules/${moduleId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
    },
  });

  // Publish course mutation
  const publishCourseMutation = useMutation({
    mutationFn: async ({ courseId, isPublished }: any) => {
      const res = await fetch(`/api/courses/${courseId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
    },
  });

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Course Builder</h1>
        <CreateCourseDialog onSubmit={(data) => createCourseMutation.mutate(data)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course list */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Courses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {courses.map((course: any) => (
                <div
                  key={course.id}
                  className={`p-4 rounded border cursor-pointer hover:bg-accent ${
                    selectedCourse?.id === course.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedCourse(course)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{course.title}</h3>
                      <p className="text-sm text-muted-foreground">{course.slug}</p>
                    </div>
                    {course.isPublished ? (
                      <Eye className="w-4 h-4 text-green-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Course editor */}
        <div className="lg:col-span-2">
          {selectedCourse ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{selectedCourse.title}</CardTitle>
                  <Button
                    onClick={() =>
                      publishCourseMutation.mutate({
                        courseId: selectedCourse.id,
                        isPublished: !selectedCourse.isPublished,
                      })
                    }
                  >
                    {selectedCourse.isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="content">
                  <TabsList>
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>

                  <TabsContent value="content" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">Modules & Lessons</h3>
                      <CreateModuleDialog
                        courseId={selectedCourse.id}
                        onSubmit={(data) =>
                          createModuleMutation.mutate({ courseId: selectedCourse.id, data })
                        }
                      />
                    </div>

                    <Accordion type="multiple" className="w-full">
                      {selectedCourse.modules?.map((module: any) => (
                        <AccordionItem key={module.id} value={module.id}>
                          <AccordionTrigger>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{module.title}</span>
                              <span className="text-sm text-muted-foreground">
                                ({module.lessons?.length || 0} lessons)
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pl-4">
                              {module.lessons?.map((lesson: any) => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center justify-between p-3 border rounded"
                                >
                                  <div className="flex items-center gap-3">
                                    <Video className="w-4 h-4" />
                                    <div>
                                      <p className="font-medium">{lesson.title}</p>
                                      {lesson.muxPlaybackId && (
                                        <p className="text-xs text-green-600">Video ready</p>
                                      )}
                                    </div>
                                  </div>
                                  <Button variant="ghost" size="sm">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}

                              <CreateLessonDialog
                                moduleId={module.id}
                                onSubmit={(data) =>
                                  createLessonMutation.mutate({ moduleId: module.id, data })
                                }
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </TabsContent>

                  <TabsContent value="settings">
                    <p className="text-muted-foreground">Course settings coming soon...</p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Select a course to edit</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateCourseDialog({ onSubmit }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    productId: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setOpen(false);
    setFormData({ title: '', slug: '', description: '', productId: '' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Course
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Course</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full">
            Create Course
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateModuleDialog({ courseId, onSubmit }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    orderIndex: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setOpen(false);
    setFormData({ title: '', slug: '', description: '', orderIndex: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Module
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Module</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="module-title">Title</Label>
            <Input
              id="module-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="module-slug">Slug</Label>
            <Input
              id="module-slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="module-description">Description</Label>
            <Textarea
              id="module-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full">
            Create Module
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateLessonDialog({ moduleId, onSubmit }: any) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    content: '',
    orderIndex: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setOpen(false);
    setFormData({ title: '', slug: '', description: '', content: '', orderIndex: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Lesson
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Lesson</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="lesson-title">Title</Label>
            <Input
              id="lesson-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="lesson-slug">Slug</Label>
            <Input
              id="lesson-slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="lesson-description">Description</Label>
            <Textarea
              id="lesson-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="lesson-content">Content (Markdown)</Label>
            <Textarea
              id="lesson-content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
            />
          </div>
          <Button type="submit" className="w-full">
            Create Lesson
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
