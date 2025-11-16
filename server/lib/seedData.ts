import { db } from '../db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function seedBadges() {
  const { badges } = await import('@shared/schema');

  // Check if badges already exist
  const existing = await db.select().from(badges).limit(1);
  if (existing.length > 0) {
    console.log('✓ Badges already seeded');
    return;
  }

  const badgeData = [
    {
      id: randomUUID(),
      name: 'First Lesson',
      slug: 'first-lesson',
      description: 'Completed your first lesson',
      icon: '🎓',
      condition: 'lesson_completed_1',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Week Streak',
      slug: 'week-streak',
      description: '7 days in a row of learning',
      icon: '🔥',
      condition: 'streak_7d',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'First Comment',
      slug: 'first-comment',
      description: 'Posted your first comment',
      icon: '💬',
      condition: 'comment_posted_1',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Course Complete',
      slug: 'course-complete',
      description: 'Completed your first course',
      icon: '🏆',
      condition: 'course_completed_1',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Early Bird',
      slug: 'early-bird',
      description: 'Started learning before 8am',
      icon: '🌅',
      condition: 'lesson_started_before_8am',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Night Owl',
      slug: 'night-owl',
      description: 'Learning after 10pm',
      icon: '🦉',
      condition: 'lesson_started_after_10pm',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Community Helper',
      slug: 'community-helper',
      description: 'Helped others with 10+ comments',
      icon: '🤝',
      condition: 'comments_posted_10',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Perfect Week',
      slug: 'perfect-week',
      description: 'Earned 100+ points in a week',
      icon: '⭐',
      condition: 'points_week_100',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Tool Master',
      slug: 'tool-master',
      description: 'Used 5 different tools',
      icon: '🛠️',
      condition: 'tools_used_5',
      isActive: 1,
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      name: 'Fast Learner',
      slug: 'fast-learner',
      description: 'Completed a course in under a week',
      icon: '⚡',
      condition: 'course_completed_7d',
      isActive: 1,
      createdAt: new Date(),
    },
  ];

  await db.insert(badges).values(badgeData);
  console.log(`✓ Seeded ${badgeData.length} badges`);
}

export async function seedSampleCourse() {
  const { products, courses, modules, lessons } = await import('@shared/schema');

  // Check if sample course exists
  const existing = await db.select().from(courses).limit(1);
  if (existing.length > 0) {
    console.log('✓ Sample course already exists');
    return;
  }

  // Create product
  const productId = randomUUID();
  await db.insert(products).values({
    id: productId,
    name: 'Appraiser Secrets: Master Real Estate Valuation',
    slug: 'appraiser-secrets',
    description: 'The complete guide to professional real estate appraisal',
    type: 'course',
    priceUsd: 29900, // $299
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create course
  const courseId = randomUUID();
  await db.insert(courses).values({
    id: courseId,
    productId,
    title: 'Appraiser Secrets: Master Real Estate Valuation',
    slug: 'appraiser-secrets',
    description:
      'Learn professional real estate appraisal from industry experts. Master market analysis, comp selection, and appraisal report writing.',
    level: 'intermediate',
    durationMinutes: 480, // 8 hours
    isPublished: 1,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create modules
  const module1Id = randomUUID();
  await db.insert(modules).values({
    id: module1Id,
    courseId,
    title: 'Appraisal Fundamentals',
    slug: 'fundamentals',
    description: 'Core concepts and principles of real estate appraisal',
    orderIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const module2Id = randomUUID();
  await db.insert(modules).values({
    id: module2Id,
    courseId,
    title: 'Market Analysis',
    slug: 'market-analysis',
    description: 'Understanding market trends and conditions',
    orderIndex: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const module3Id = randomUUID();
  await db.insert(modules).values({
    id: module3Id,
    courseId,
    title: 'Comparable Selection',
    slug: 'comparable-selection',
    description: 'Finding and evaluating comparable properties',
    orderIndex: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create lessons
  const lessonsData = [
    // Module 1 lessons
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: 'Introduction to Real Estate Appraisal',
      slug: 'introduction',
      description: 'What is appraisal and why it matters',
      content: '# Introduction to Real Estate Appraisal\n\nWelcome to the course!',
      durationSeconds: 1200, // 20 min
      orderIndex: 0,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: 'Types of Value',
      slug: 'types-of-value',
      description: 'Market value, assessed value, and more',
      content: '# Types of Value\n\nUnderstanding different types of value...',
      durationSeconds: 900,
      orderIndex: 1,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: 'The Three Approaches',
      slug: 'three-approaches',
      description: 'Sales comparison, cost, and income approaches',
      content: '# The Three Approaches\n\nEvery appraisal uses three approaches...',
      durationSeconds: 1500,
      orderIndex: 2,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Module 2 lessons
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: 'Understanding Market Trends',
      slug: 'market-trends',
      description: 'Analyzing supply, demand, and pricing trends',
      content: '# Understanding Market Trends\n\nMarket analysis is critical...',
      durationSeconds: 1800,
      orderIndex: 0,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: 'Market Conditions Report',
      slug: 'market-conditions-report',
      description: 'Creating comprehensive MCR analysis',
      content: '# Market Conditions Report\n\nThe MCR is a key deliverable...',
      durationSeconds: 2100,
      orderIndex: 1,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Module 3 lessons
    {
      id: randomUUID(),
      moduleId: module3Id,
      title: 'Finding Quality Comps',
      slug: 'finding-comps',
      description: 'Sources and strategies for comparable properties',
      content: '# Finding Quality Comps\n\nGood comps make great appraisals...',
      durationSeconds: 1500,
      orderIndex: 0,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      moduleId: module3Id,
      title: 'Comp Scoring and Selection',
      slug: 'comp-scoring',
      description: 'Systematically evaluating comparables',
      content: '# Comp Scoring and Selection\n\nNot all comps are equal...',
      durationSeconds: 1800,
      orderIndex: 1,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      moduleId: module3Id,
      title: 'Making Adjustments',
      slug: 'making-adjustments',
      description: 'Calculating and applying comp adjustments',
      content: '# Making Adjustments\n\nAdjustments account for differences...',
      durationSeconds: 2400,
      orderIndex: 2,
      isPublished: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  await db.insert(lessons).values(lessonsData);

  console.log(`✓ Seeded sample course with ${lessonsData.length} lessons`);
}

export async function initializeSeeds() {
  try {
    await seedBadges();
    await seedSampleCourse();
    console.log('✓ All seed data initialized');
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}
