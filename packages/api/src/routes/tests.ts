import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const testsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/test-packages
testsRouter.get('/test-packages', async (c) => {
  const orgId = c.req.query('organizationId') || '9d61d048-cbda-4600-8141-4cfd2745cc59';
  const db = drizzle(c.env.DB, { schema });

  const packages = await db
    .select()
    .from(schema.testPackages)
    .where(eq(schema.testPackages.organizationId, orgId));

  const versions = await db.select().from(schema.testPackageVersions);
  const sections = await db.select().from(schema.testSections);

  return c.json({
    ok: true,
    data: {
      packages,
      versions,
      sections,
    },
  });
});

// GET /api/standalone-tests/bundle
testsRouter.get('/standalone-tests/bundle', async (c) => {
  const runId = c.req.query('runId');
  const assignmentId = c.req.query('assignmentId');

  if (!runId && !assignmentId) {
    return c.json({ ok: false, error: 'Thiếu runId hoặc assignmentId' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });

  let currentRun = null;
  if (runId) {
    const runs = await db
      .select()
      .from(schema.standaloneTestRuns)
      .where(eq(schema.standaloneTestRuns.id, runId))
      .limit(1);
    currentRun = runs[0] ?? null;
  }

  const effectiveAssignmentId = assignmentId || currentRun?.assignmentId;
  if (!effectiveAssignmentId) {
    return c.json({ ok: false, error: 'Không tìm thấy thông tin assignment' }, 404);
  }

  // Get sibling runs
  const allRuns = await db
    .select()
    .from(schema.standaloneTestRuns)
    .where(eq(schema.standaloneTestRuns.assignmentId, effectiveAssignmentId));

  // Get run items for current run
  let runItems: (typeof schema.standaloneTestRunItems.$inferSelect)[] = [];
  if (currentRun) {
    runItems = await db
      .select()
      .from(schema.standaloneTestRunItems)
      .where(eq(schema.standaloneTestRunItems.runId, currentRun.id));
  }

  return c.json({
    ok: true,
    data: {
      currentRun,
      allRuns,
      runItems,
      audioVariants: [],
    },
  });
});

// POST /api/standalone-tests/provisional-result
testsRouter.post('/standalone-tests/provisional-result', async (c) => {
  const body = await c.req.json();
  const { attemptId, resultColor, probeCount, enteredProbeFlow } = body;

  const db = drizzle(c.env.DB, { schema });

  await db
    .insert(schema.standaloneTestAttemptSnapshots)
    .values({
      id: crypto.randomUUID(),
      attemptId,
      currentResultColor: resultColor,
      enteredProbeFlow: Boolean(enteredProbeFlow),
      probeCount: probeCount || 0,
      isFinalized: false,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.standaloneTestAttemptSnapshots.attemptId,
      set: {
        currentResultColor: resultColor,
        enteredProbeFlow: Boolean(enteredProbeFlow),
        probeCount: probeCount || 0,
        updatedAt: new Date().toISOString(),
      },
    });

  // Record event stream
  await db.insert(schema.standaloneTestEvents).values({
    id: crypto.randomUUID(),
    attemptId,
    eventType: 'provisional_result',
    resultColor,
    probeCount: probeCount || 0,
    createdAt: new Date().toISOString(),
  });

  return c.json({ ok: true });
});
