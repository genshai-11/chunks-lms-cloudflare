import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { workspaceRouter } from './routes/workspace';
import { testsRouter } from './routes/tests';
import { guestRouter } from './routes/guest';

type Bindings = {
  DB: D1Database;
  BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Role', 'X-User-Id', 'X-Guest-Token'],
  }),
);

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    edge: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
  });
});

// Mount modular sub-routers
app.route('/api/auth', authRouter);
app.route('/api/workspace', workspaceRouter);
app.route('/api', testsRouter);
app.route('/api/guest', guestRouter);

// Fallback to static assets for SPA routing if ASSETS binding exists
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Chunks-LMS API Edge Worker Running', 200);
});

export default app;
