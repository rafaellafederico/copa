import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE = "https://api.football-data.org/v4";

Deno.serve(async (_req) => {
  const apiKey = Deno.env.get("APIFOOTBALL_KEY");
  if (!apiKey) return json({ error: "APIFOOTBALL_KEY não configurada" }, 500);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const headers = { "X-Auth-Token": apiKey };

  const fr = await fetch(`${API_BASE}/competitions/WC/matches`, { headers });
  const fj = await fr.json();
  const fixtures: any[] = fj.matches ?? [];
  if (!fixtures.length) return json({ error: "API não retornou jogos", detail: fj }, 502);

  const rows = fixtures.map((m) => ({
    ext_id: m.id,
    home: m.homeTeam.name ?? "A definir",
    away: m.awayTeam.name ?? "A definir",
    kickoff: m.utcDate,
    round: m.stage ?? String(m.matchday ?? ""),
    res_home: m.status === "FINISHED" ? m.score.fullTime.home : null,
    res_away: m.status === "FINISHED" ? m.score.fullTime.away : null,
  }));

  const { error: upErr } = await sb.from("matches").upsert(rows, { onConflict: "ext_id" });
  if (upErr) return json({ error: "Erro ao gravar jogos", detail: upErr.message }, 500);

  return json({ ok: true, jogos_sincronizados: rows.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
