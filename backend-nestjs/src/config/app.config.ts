import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? 3000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  exportsDir: process.env.EXPORTS_DIR ?? 'storage/exports',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? '',
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'books',
  notificationTo: process.env.NOTIFICATION_TO ?? 'jabirnawaz021@gmail.com',
  resendFrom: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-1.5-pro-latest',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  claudeModel:
    process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
}));
