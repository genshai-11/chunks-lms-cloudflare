import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { workspaceRouter } from './routes/workspace';
import { testsRouter } from './routes/tests';
import { guestRouter } from './routes/guest';
import { queryRouter } from './routes/query';

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
app.route('/api', queryRouter);
// Audio asset proxy from R2
app.get('/api/audio/*', async (c) => {
  const path = c.req.path.replace(/^\/api\/audio\//, '');
  if (c.env.BUCKET) {
    const object = await c.env.BUCKET.get(path);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      return new Response(object.body, { headers });
    }
  }
  return c.text('Audio asset not found', 404);
});


// Fallback to static assets for SPA routing if ASSETS binding exists
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Chunks-LMS API Edge Worker Running', 200);
});

export default app;
