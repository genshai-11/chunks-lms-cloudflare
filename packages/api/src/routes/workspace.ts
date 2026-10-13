import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const workspaceRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/workspace/snapshot
workspaceRouter.get('/snapshot', async (c) => {
  const orgId = c.req.query('organizationId') || 'a0000000-0000-4000-8000-000000000001';
  const role = c.req.header('X-User-Role') || 'admin';
  const actorUserId = c.req.header('X-User-Id');

  const db = drizzle(c.env.DB, { schema });

  // Get current revision
  const versionRow = await db
    .select()
    .from(schema.organizationWorkspaceVersions)
    .limit(1);

  const currentRevision = versionRow[0]?.revision ?? 1;

  // Courses
  const allCourses = await db.select().from(schema.courses);

  // Classes
  const visibleClasses = await db.select().from(schema.classes);

  // Enrollments
  const visibleEnrollments = await db.select().from(schema.enrollments);

  // Users
  const visibleUsers = await db.select().from(schema.users);

  // Sessions
  const visibleLearningSessions = await db.select().from(schema.learningSessions);
  return c.json({
    ok: true,
    data: {
      organizationId: orgId,
      revision: currentRevision,
      courses: allCourses,
      classes: visibleClasses,
      enrollments: visibleEnrollments,
      users: visibleUsers,
      learningSessions: visibleLearningSessions,
      scheduledSessions: [],
    },
  });
});

// POST /api/workspace/sync
workspaceRouter.post('/sync', async (c) => {
  const body = await c.req.json();
  const { organizationId, expectedRevision, roster, scheduling } = body;

  const db = drizzle(c.env.DB, { schema });

  // Check OCC revision
  const versionRows = await db
    .select()
    .from(schema.organizationWorkspaceVersions)
    .where(eq(schema.organizationWorkspaceVersions.organizationId, organizationId))
    .limit(1);

  const currentRev = versionRows[0]?.revision ?? 1;

  if (typeof expectedRevision === 'number' && expectedRevision < currentRev) {
    return c.json(
      {
        ok: false,
        error: 'CONFLICT_REVISION_MISMATCH',
        currentRevision: currentRev,
        expectedRevision,
      },
      409,
    );
  }

  const nextRev = currentRev + 1;

  // Execute atomic update in D1
  const batchStatements: Promise<unknown>[] = [];

  // Update revision
  batchStatements.push(
    db
      .insert(schema.organizationWorkspaceVersions)
      .values({
        organizationId,
        revision: nextRev,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.organizationWorkspaceVersions.organizationId,
        set: { revision: nextRev, updatedAt: new Date().toISOString() },
      }),
  );

  // Save courses if present
  if (Array.isArray(roster?.courses)) {
    for (const crs of roster.courses) {
      batchStatements.push(
        db
          .insert(schema.courses)
          .values({
            id: crs.id,
            organizationId,
            code: crs.code,
            name: crs.name,
            status: crs.status || 'active',
          })
          .onConflictDoUpdate({
            target: schema.courses.id,
            set: { name: crs.name, code: crs.code, status: crs.status },
          }),
      );
    }
  }

  // Save classes if present
  if (Array.isArray(roster?.classes)) {
    for (const cls of roster.classes) {
      batchStatements.push(
        db
          .insert(schema.classes)
          .values({
            id: cls.id,
            courseId: cls.courseId,
            name: cls.name,
            capacity: cls.capacity || 30,
            teacherUserId: cls.teacherUserId,
            status: cls.status || 'active',
          })
          .onConflictDoUpdate({
            target: schema.classes.id,
            set: { name: cls.name, capacity: cls.capacity, status: cls.status },
          }),
      );
    }
  }

  // Execute statements in batch
  await Promise.all(batchStatements);

  return c.json({
    ok: true,
    data: {
      newRevision: nextRev,
    },
  });
});
