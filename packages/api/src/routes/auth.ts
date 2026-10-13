import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const authRouter = new Hono<{ Bindings: { DB: D1Database } }>();


// POST /api/auth/login
authRouter.post('/login', async (c) => {
  const { identifier, password } = await c.req.json();
  if (!identifier) {
    return c.json({ ok: false, error: 'Thiếu thông tin đăng nhập' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const cleanId = String(identifier).trim().toLowerCase();

  // Find user by email or username
  const userList = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, cleanId))
    .limit(1);

  let user = userList[0];
  if (!user) {
    const userByName = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, cleanId))
      .limit(1);
    user = userByName[0];
  }

  // Fallback alias for 'teacher' to existing teacher account 'maddie'
  if (!user && cleanId === 'teacher') {
    const teacherAlias = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'maddie'))
      .limit(1);
    user = teacherAlias[0];
  }
  if (password && typeof password === 'string') {
    const p = password.trim();
    if (p !== 'chunker123' && p !== 'admin123' && p !== 'teacher123') {
      return c.json({ ok: false, error: 'Mật khẩu không chính xác (mật khẩu mặc định: chunker123)' }, 401);
    }
  }

  // Get staff roles
  const roles = await db
    .select()
    .from(schema.staffRoles)
    .where(eq(schema.staffRoles.userId, user.id));

  const roleNames = roles.map((r) => r.role);
  const token = crypto.randomUUID();

  return c.json({
    ok: true,
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      roles: roleNames.length > 0 ? roleNames : ['teacher'],
    },
  });
});

// GET /api/auth/me
authRouter.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ ok: false, error: 'Chưa đăng nhập' }, 401);
  }

  // Mock / session resolution for demo
  return c.json({
    ok: true,
    authenticated: true,
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (c) => {
  return c.json({ ok: true });
});
