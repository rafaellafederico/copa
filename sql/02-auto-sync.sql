-- ============================================
-- BOLÃO DA COPA — Sync automático (parte SQL)
-- Rode DEPOIS do schema.sql, no SQL Editor
-- ============================================

-- 1) Colunas novas na tabela de jogos
alter table public.matches add column if not exists ext_id bigint unique;
alter table public.matches add column if not exists round text;

-- 2) Habilita extensões de agendamento
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

-- 3) Agenda a sincronização a cada 30 minutos
-- ⚠️ TROQUE:
--   SEU_PROJETO  -> ref do seu projeto (está na URL do Supabase)
--   SUA_ANON_KEY -> sua anon key (Settings → API)
select cron.schedule(
  'sync-copa',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://orfrakexhgmzapyoajka.supabase.co/functions/v1/sync-copa',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_Wo7ux33xnvMb1w39rItAMg_db4njGSl'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir se o agendamento ficou ativo:
-- select * from cron.job;

-- Para remover o agendamento (se precisar):
-- select cron.unschedule('sync-copa');
