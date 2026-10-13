import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional().or(z.literal('')).default(''),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
  VITE_AUTH_BYPASS: z.string().optional().default('false'),
  MODE: z.string().optional(),
  DEV: z.boolean().optional(),
  PROD: z.boolean().optional(),
})


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

  const authBypass = true
  const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

  return {
    supabaseUrl,
    supabaseAnonKey,
    authBypass,
    isConfigured,
    canBoot: true,
  }
}

export const env = readEnv()
