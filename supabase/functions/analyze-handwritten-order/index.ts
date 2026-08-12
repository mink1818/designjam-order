import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 허용됩니다." }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "로그인이 필요합니다." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "AI 사진분석 설정이 필요합니다. Supabase OPENAI_API_KEY를 설정해주세요.", code: "OPENAI_KEY_MISSING" }, 503);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return json({ error: "로그인 정보를 확인할 수 없습니다." }, 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile } = await admin.from("customers").select("is_admin,blocked").eq("id", callerData.user.id).maybeSingle();
    if (profile?.is_admin !== true || profile?.blocked === true) return json({ error: "관리자 권한이 없습니다." }, 403);

    const body = await req.json().catch(() => ({}));
    const images = Array.isArray(body.images) ? body.images.filter((value: unknown) => typeof value === "string" && /^data:image\/(?:jpeg|png|webp);base64,/.test(value as string)).slice(0, 5) : [];
    const knownItems = Array.isArray(body.known_items) ? [...new Set(body.known_items.map((value: unknown) => String(value || "").trim().toUpperCase()).filter(Boolean))].slice(0, 12000) : [];
    if (!images.length) return json({ error: "분석할 사진이 없습니다." }, 400);

    const prompt = `당신은 한국 양말 도매 주문 메모의 손글씨 숫자를 판독하는 전문가입니다.
사진마다 손으로 쓴 품번과 수량을 위에서 아래 순서대로 읽으세요.
일반 형식은 '품번-수량', '품번 수량'이며 수량이 없으면 1입니다. 품번에는 숫자와 선택적 A/M, S-/B-/I- 접두가 올 수 있습니다.
배경의 인쇄된 표, 도장, 희미한 뒷면 글씨, 날짜, 전화번호는 무시하고 진한 손글씨 주문만 읽으세요.
보이는 획을 임의로 만들지 마세요. 특히 1/7, 4/9, 0/6, 2/7을 주의하세요.
등록 품번 목록과 일치하는 후보를 우선 사용하되 사진에 없는 품번을 억지로 선택하지 마세요.
각 행에 원래 보이는 글자 observed_text, 최종 품번 item_number, 수량 qty, 확신도 confidence(0~1), 확인 필요 여부 needs_review를 반환하세요.
확신도가 0.82 미만이거나 등록 품번과 일치하지 않으면 needs_review=true로 설정하세요.

등록 품번 목록:
${knownItems.join(",")}`;
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }, ...images.map((image_url: string) => ({ type: "input_image", image_url, detail: "high" }))];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [{ role: "user", content }],
        temperature: 0,
        text: { format: { type: "json_schema", name: "handwritten_order", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            items: { type: "array", items: { type: "object", additionalProperties: false, properties: {
              observed_text: { type: "string" }, item_number: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 9999 }, confidence: { type: "number", minimum: 0, maximum: 1 }, needs_review: { type: "boolean" }
            }, required: ["observed_text", "item_number", "qty", "confidence", "needs_review"] } },
            note: { type: "string" }
          }, required: ["items", "note"]
        } } }
      }),
    });
    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || "AI 사진분석 요청에 실패했습니다." }, response.status >= 500 ? 502 : 400);
    const outputText = result?.output_text || result?.output?.flatMap((entry: any) => entry?.content || []).find((entry: any) => entry?.type === "output_text")?.text;
    if (!outputText) return json({ error: "AI 분석 결과가 비어 있습니다." }, 502);
    const parsed = JSON.parse(outputText);
    const known = new Set(knownItems.map((value: string) => value.replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/, "")));
    const items = (Array.isArray(parsed.items) ? parsed.items : []).map((row: any) => {
      const number = String(row.item_number || "").trim().toUpperCase();
      const key = number.replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/, "");
      const registered = known.has(key);
      return { observed_text: String(row.observed_text || ""), item_number: number, qty: Math.max(1, Number(row.qty || 1)), confidence: Number(row.confidence || 0), registered, needs_review: Boolean(row.needs_review) || !registered || Number(row.confidence || 0) < 0.82 };
    }).filter((row: any) => row.item_number);
    return json({ ok: true, items, note: String(parsed.note || ""), model: "gpt-4.1" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "사진분석 중 오류가 발생했습니다." }, 500);
  }
});
