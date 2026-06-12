# Bolão da Copa 2026

Site de bolão entre amigos para a Copa do Mundo 2026 (11/jun–19/jul). Cada participante se cadastra, palpita **placar + total de cartões** de cada jogo, e os pontos somam num ranking final.

## Stack

- **Frontend:** `site/index.html` — single-file (HTML/CSS/JS puro), hospedado no **Netlify** (deploy por drag-and-drop ou `netlify deploy`).
- **Backend:** **Supabase** — Postgres + Auth (e-mail/senha) + Edge Function.
- **Dados automáticos:** **API-Football** (plano free, 100 req/dia, league=1 season=2026) via Edge Function `sync-copa` agendada por pg_cron a cada 30 min.

## Regras de pontuação (configuráveis na tabela `settings`)

- Placar exato: **+5**
- Acertou só o vencedor (ou empate): **+3**
- Desempate no ranking: mais placares exatos.

## Banco (ver `sql/01-schema.sql`)

- `profiles` (id = auth.users, name, is_admin) — criado por trigger no cadastro.
- `matches` (home, away, kickoff, locked, res_home, res_away, res_cards, ext_id, round) — `ext_id` é o fixture id da API-Football.
- `bets` (user_id, match_id, home, away, cards) — PK composta.
- `settings` (linha única com os pontos).

### RLS (regras importantes)

- Palpite de outra pessoa **só fica visível depois que o jogo fecha** (policy usa `match_open()`).
- Palpite só pode ser criado/editado enquanto `match_open()` = true (não travado, sem resultado, kickoff no futuro).
- Só admin (`is_admin()`) altera `matches` e `settings`.
- A Edge Function usa a service role key (bypassa RLS).

## Edge Function `sync-copa` (`supabase/functions/sync-copa/index.ts`)

A cada execução: 1 req lista os 104 jogos e faz upsert por `ext_id` (placar só quando status FT/AET/PEN); depois busca cartões (`/fixtures/statistics`) apenas para jogos terminados com `res_cards` nulo, máx. 8 por execução (proteção da cota de 100 req/dia). Secret necessária: `APIFOOTBALL_KEY`.

Cron: `sql/02-auto-sync.sql` agenda via pg_cron + pg_net chamando a function com a anon key.

## Frontend (`site/index.html`)

- Config no topo do `<script>`: `SUPABASE_URL` e `SUPABASE_ANON_KEY` (placeholders `COLE_AQUI_...`).
- Telas: login/cadastro → abas Jogos / Ranking / Admin (admin só aparece se `profiles.is_admin`).
- Jogos: filtros Abertos / Hoje / Encerrados / Todos; card estilo placar de estádio; steppers de palpite; após o resultado, badges de acerto (✓ placar exato / ✓ vencedor / ✗) + pontos + "ver palpites de todos".
- Design system: verde gramado `#0C3327`, dourado `#E5B84A`, fonte display Saira Condensed, corpo Archivo. Mobile-first.

## Estado do setup (checklist)

- [ ] Projeto Supabase criado, `sql/01-schema.sql` executado
- [ ] Confirmação de e-mail desativada (Authentication → Sign In/Providers → Email)
- [ ] `sql/02-auto-sync.sql` executado (trocar SEU_PROJETO e SUA_ANON_KEY no cron)
- [ ] Edge Function `sync-copa` deployada + secret `APIFOOTBALL_KEY`
- [ ] URL e anon key coladas no `site/index.html`
- [ ] Site publicado no Netlify
- [ ] Rafa marcada como admin (`update profiles set is_admin = true where id = (select id from auth.users where email = '...')`)

## Decisões / pendências

- Cartões = amarelos + vermelhos somados (mudar em `index.ts` se for só amarelos).
- Resultado entra até ~30 min após o fim do jogo (cron a cada 30 min; dá pra apertar pra `*/15`).
- Possíveis evoluções: nomes dos times em PT-BR (API retorna em inglês), bandeiras, notificação de "palpite faltando" antes do jogo, prêmio/rateio no ranking.

## Comandos úteis (Supabase CLI)

```bash
supabase login
supabase link --project-ref <ref>
supabase functions deploy sync-copa
supabase secrets set APIFOOTBALL_KEY=<chave>
supabase functions invoke sync-copa   # primeira carga manual
```
