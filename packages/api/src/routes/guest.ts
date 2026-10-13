import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const guestRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// POST /api/guest/create-token (Teacher creates an evaluation invite token)
guestRouter.post('/create-token', async (c) => {
  const body = await c.req.json();
  const { assignmentId, learnerId, createdByUserId, guestName, expiryHours } = body;

  if (!assignmentId || !learnerId || !createdByUserId) {
    return c.json({ ok: false, error: 'Thiếu thông tin tạo token đánh giá' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const rawBytes = new Uint8Array(24);
  crypto.getRandomValues(rawBytes);
  const secureToken = 'gt_' + Array.from(rawBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  const hours = expiryHours && typeof expiryHours === 'number' ? expiryHours : 48;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  const tokenId = crypto.randomUUID();

  await db.insert(schema.guestAssessmentTokens).values({
    id: tokenId,
    token: secureToken,
    assignmentId,
    learnerId,
    createdByUserId,
    guestName: guestName ? String(guestName).trim() : null,
    expiresAt,
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  return c.json({
    ok: true,
    data: {
      token: secureToken,
      expiresAt,
      evalUrl: `/eval?token=${secureToken}`,
    },
  });
});

// GET /api/guest/verify/:token (Guest opens link, validates token)
guestRouter.get('/verify/:token', async (c) => {
  const token = c.req.param('token');
  const db = drizzle(c.env.DB, { schema });

  const tokenRows = await db
    .select()
    .from(schema.guestAssessmentTokens)
    .where(eq(schema.guestAssessmentTokens.token, token))
    .limit(1);

  const guestToken = tokenRows[0];
  if (!guestToken) {
    return c.json({ ok: false, error: 'Link đánh giá không hợp lệ hoặc không tồn tại' }, 404);
  }

  if (new Date(guestToken.expiresAt).getTime() < Date.now()) {
    return c.json({ ok: false, error: 'Link đánh giá đã hết hạn sử dụng' }, 410);
  }

  if (guestToken.status === 'revoked') {
    return c.json({ ok: false, error: 'Link đánh giá đã bị thu hồi' }, 403);
  }

  // Get learner info (minimal scoped profile)
  const learnerRows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, guestToken.learnerId))
    .limit(1);

  // Get assignment info
  const assignmentRows = await db
    .select()
    .from(schema.standaloneTestAssignments)
    .where(eq(schema.standaloneTestAssignments.id, guestToken.assignmentId))
    .limit(1);

  return c.json({
    ok: true,
    data: {
      valid: true,
      token: guestToken.token,
      guestName: guestToken.guestName,
      learner: learnerRows[0] ?? { id: guestToken.learnerId, displayName: 'Học viên' },
      assignment: assignmentRows[0] ?? null,
      status: guestToken.status,
    },
  });
});

// POST /api/guest/submit/:token (Guest finalizes assessment)
guestRouter.post('/submit/:token', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json();
  const { guestAssessorName, runId } = body;

  const db = drizzle(c.env.DB, { schema });

  const tokenRows = await db
    .select()
    .from(schema.guestAssessmentTokens)
    .where(eq(schema.guestAssessmentTokens.token, token))
    .limit(1);

  const guestToken = tokenRows[0];
  if (!guestToken || guestToken.status !== 'active') {
    return c.json({ ok: false, error: 'Token không hợp lệ để ghi nhận' }, 400);
  }

  // Update run metadata
  if (runId) {
    await db
      .update(schema.standaloneTestRuns)
      .set({
        assessorRole: 'guest',
        assessorName: guestAssessorName ? String(guestAssessorName).trim() : 'Giám khảo khách',
        status: 'completed',
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.standaloneTestRuns.id, runId));
  }

  // Mark token submitted
  await db
    .update(schema.guestAssessmentTokens)
    .set({
      status: 'submitted',
      guestName: guestAssessorName ? String(guestAssessorName).trim() : guestToken.guestName,
    })
    .where(eq(schema.guestAssessmentTokens.id, guestToken.id));

  return c.json({
    ok: true,
    message: 'Ghi nhận kết quả đánh giá của Giám khảo thành công',
  });
});

// GET /api/guest/sandbox/sample-test (For playground without token)
guestRouter.get('/sandbox/sample-test', async (c) => {
  const db = drizzle(c.env.DB, { schema });

  // Get sample package
  const packages = await db
    .select()
    .from(schema.testPackages)
    .limit(1);

  const defaultPkg = packages[0];
  if (!defaultPkg) {
    return c.json({ ok: false, error: 'Chưa có bộ test mẫu' }, 404);
  }

  const sections = await db
    .select()
    .from(schema.testSections)
    .limit(7);

  const firstSection = sections[0];
  let items: (typeof schema.testItems.$inferSelect)[] = [];
  if (firstSection) {
    items = await db
      .select()
      .from(schema.testItems)
      .where(eq(schema.testItems.sectionId, firstSection.id))
      .limit(7);
  }

  return c.json({
    ok: true,
    data: {
      package: defaultPkg,
      sections,
      items,
      mockLearner: {
        id: 'guest_sandbox_learner',
        displayName: 'Học viên Thử nghiệm (Demo)',
      },
    },
  });
});
