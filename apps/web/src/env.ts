import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional().or(z.literal('')).default(''),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
  VITE_AUTH_BYPASS: z.string().optional().default('false'),
  MODE: z.string().optional(),
  DEV: z.boolean().optional(),
  PROD: z.boolean().optional(),
})

function truthy(raw: string | undefined): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export type AppEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  /** Local/CI only — grants Admin+Teacher without sign-in. Never true in production. */
  authBypass: boolean
  /** Supabase URL + anon/publishable key are configured. */
  isConfigured: boolean
  /** App can boot with native Supabase Auth or local/CI auth bypass. */
  canBoot: boolean
}

function readEnv(): AppEnv {
  const parsed = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_AUTH_BYPASS: import.meta.env.VITE_AUTH_BYPASS,
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
  })

  if (!parsed.success) {
    console.warn('Environment validation warnings', parsed.error.flatten())
  }

  const data = parsed.success
    ? parsed.data
    : {
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
        VITE_AUTH_BYPASS: 'false',
      }

  const supabaseUrl = data.VITE_SUPABASE_URL
  const supabaseAnonKey = data.VITE_SUPABASE_ANON_KEY

  /**
   * Vite sets PROD=true for every `vite build` (local preview, Vercel Preview, and
   * Production). Only block staff auth bypass on real Vercel Production deploys.
   */
  const vercelEnv = String(import.meta.env.VITE_VERCEL_ENV ?? '').trim()
  const isVercelProduction = vercelEnv === 'production'
  const authBypassRequested = truthy(data.VITE_AUTH_BYPASS)
  const authBypass = authBypassRequested && !isVercelProduction

  if (authBypassRequested && isVercelProduction) {
    console.warn('VITE_AUTH_BYPASS is ignored on Vercel Production — use native Supabase Auth')
  }

  const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

  return {
    supabaseUrl,
    supabaseAnonKey,
    authBypass,
    isConfigured,
    canBoot: isConfigured || authBypass,
  }
}

export const env = readEnv()
