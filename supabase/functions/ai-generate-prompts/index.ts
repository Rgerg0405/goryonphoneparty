// AI prompt generator for Goryon Phone "AI PROMPT" game mode.
// Uses Lovable AI Gateway (google/gemini-3-flash-preview) to invent
// funny Hungarian sentences that players will draw.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { count = 6 } = await req.json().catch(() => ({}));
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Te egy magyar party játék prompt-generátora vagy. Adj VICCES, ABSZURD, könnyen lerajzolható magyar mondatokat. Egy mondat maximum 12 szó. Csak a mondatokat add vissza, számozás vagy idézőjel nélkül, soronként egyet.",
          },
          {
            role: "user",
            content: `Adj ${count} darab vicces magyar mondatot a Goryon Phone játékhoz. Minden mondat egy sorba.`,
          },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Túl sok kérés, próbáld újra később." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Elfogytak az AI kreditek." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "AI hiba", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const prompts = String(text)
      .split("\n")
      .map((l: string) => l.replace(/^[\s\-\*\d\.\)]+/, "").trim())
      .filter((l: string) => l.length > 2)
      .slice(0, count);

    return new Response(JSON.stringify({ prompts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});