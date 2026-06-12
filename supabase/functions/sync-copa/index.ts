// ============================================
// BOLÃO DA COPA — Edge Function "sync-copa"
// Supabase Dashboard → Edge Functions → Deploy new function
// Nome da função: sync-copa
// Cole este código inteiro.
//
// Antes, em Edge Functions → Secrets, crie:
//   APIFOOTBALL_KEY = sua chave da API-Football
//   (pegue grátis em dashboard.api-football.com — 100 req/dia)
// ============================================

import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE = 1;      // FIFA World Cup
const SEASON = 2026;
const FINISHED = ["FT", "AET", "PEN"];
const MAX_STATS_PER_RUN = 8; // limite de buscas de cartões por execução (proteção da cota diária)

Deno.serve(async (_req) => {
  const apiKey = Deno.env.get("APIFOOTBALL_KEY");
  if (!apiKey) return json({ error: "APIFOOTBALL_KEY não configurada" }, 500);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const headers = { "x-apisports-key": apiKey };

  // 1) Busca todos os jogos da Copa (1 requisição)
  const fr = await fetch(`${API_BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`, { headers });
  const fj = await fr.json();
  const fixtures: any[] = fj.response ?? [];
  if (!fixtures.length) return json({ error: "API não retornou jogos", detail: fj.errors ?? null }, 502);

  // 2) Upsert dos jogos (placar só quando o jogo termina)
  const rows = fixtures.map((f) => {
    const done = FINISHED.includes(f.fixture.status.short);
    return {
      ext_id: f.fixture.id,
      home: f.teams.home.name,
      away: f.teams.away.name,
      kickoff: f.fixture.date,
      round: f.league.round,
      res_home: done ? f.goals.home : null,
      res_away: done ? f.goals.away : null,
    };
  });
  const { error: upErr } = await sb.from("matches").upsert(rows, { onConflict: "ext_id" });
  if (upErr) return json({ error: "Erro ao gravar jogos", detail: upErr.message }, 500);

  // 3) Cartões: só para jogos terminados que ainda não têm cartões gravados
  const { data: pendentes } = await sb
    .from("matches")
    .select("id, ext_id")
    .not("ext_id", "is", null)
    .not("res_home", "is", null)
    .is("res_cards", null)
    .limit(MAX_STATS_PER_RUN);

  let cardsUpdated = 0;
  for (const m of pendentes ?? []) {
    const sr = await fetch(`${API_BASE}/fixtures/statistics?fixture=${m.ext_id}`, { headers });
    const sj = await sr.json();
    let total = 0;
    let found = false;
    for (const team of sj.response ?? []) {
      for (const st of team.statistics ?? []) {
        if (st.type === "Yellow Cards" || st.type === "Red Cards") {
          total += Number(st.value ?? 0);
          found = true;
        }
      }
    }
    if (found) {
      await sb.from("matches").update({ res_cards: total }).eq("id", m.id);
      cardsUpdated++;
    }
  }

  return json({
    ok: true,
    jogos_sincronizados: rows.length,
    cartoes_atualizados: cardsUpdated,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
