import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROOT_ADMIN_EMAILS = new Set([
  "900smk@naver.com",
  "sm0727sm@hanmail.net",
  "p1028p@naver.com",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 허용됩니다." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "로그인이 필요합니다." }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    const caller = callerData.user;
    if (callerError || !caller) return json({ error: "로그인 정보를 확인할 수 없습니다." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerProfile } = await admin
      .from("customers")
      .select("id,is_admin,blocked,email,admin_role")
      .eq("id", caller.id)
      .maybeSingle();
    const callerEmail = String(caller.email || callerProfile?.email || "").toLowerCase();
    const isDeveloper = ROOT_ADMIN_EMAILS.has(callerEmail) || callerProfile?.admin_role === "developer_admin";
    const allowed = isDeveloper || (callerProfile?.is_admin === true && callerProfile?.blocked !== true);
    if (!allowed) return json({ error: "관리자 권한이 없습니다." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "set_password") {
      const targetId = String(body.target_id || "");
      const password = String(body.password || "");
      if (!targetId) return json({ error: "대상 계정이 없습니다." }, 400);
      if (password.length < 6) return json({ error: "비밀번호는 6자리 이상이어야 합니다." }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, message: "비밀번호가 변경되었습니다." });
    }

    if (action === "create_admin") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      const role = body.role === "developer_admin" ? "developer_admin" : "admin";
      if (!isDeveloper) return json({ error: "개발관리자만 관리자 계정을 추가할 수 있습니다." }, 403);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "관리자 이메일을 정확히 입력하세요." }, 400);
      if (password.length < 8) return json({ error: "관리자 비밀번호는 8자리 이상이어야 합니다." }, 400);
      if (!name) return json({ error: "관리자 이름을 입력하세요." }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { business_name: name, owner_name: name, email, is_admin: true },
      });
      if (error || !data.user) return json({ error: error?.message || "관리자 계정을 만들지 못했습니다." }, 400);

      const profile = {
        id: data.user.id,
        email,
        business_name: name,
        owner_name: name,
        representative: name,
        is_admin: true,
        approved: true,
        blocked: false,
        admin_role: role,
      };
      const { error: profileError } = await admin.from("customers").upsert(profile, { onConflict: "id" });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return json({ error: `관리자 정보 저장 실패: ${profileError.message}` }, 400);
      }
      return json({ ok: true, admin: { id: data.user.id, email, name } });
    }

    if (action === "set_admin_role") {
      if (!isDeveloper) return json({ error: "개발관리자만 권한을 변경할 수 있습니다." }, 403);
      const targetId = String(body.target_id || "");
      const role = body.role === "developer_admin" ? "developer_admin" : "admin";
      if (!targetId) return json({ error: "대상 관리자가 없습니다." }, 400);
      if (targetId === caller.id && role !== "developer_admin") return json({ error: "현재 로그인한 개발관리자 본인의 권한은 낮출 수 없습니다." }, 400);
      if (role === "admin") {
        const { count } = await admin.from("customers").select("id", { count: "exact", head: true }).eq("is_admin", true).eq("admin_role", "developer_admin").eq("blocked", false);
        const { data: target } = await admin.from("customers").select("admin_role").eq("id", targetId).maybeSingle();
        if (target?.admin_role === "developer_admin" && (count || 0) <= 1) return json({ error: "마지막 개발관리자는 일반 관리자로 변경할 수 없습니다." }, 400);
      }
      const { error } = await admin.from("customers").update({ admin_role: role }).eq("id", targetId).eq("is_admin", true);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_admin_blocked") {
      const targetId = String(body.target_id || "");
      const blocked = Boolean(body.blocked);
      if (!targetId) return json({ error: "대상 관리자가 없습니다." }, 400);
      if (!isDeveloper) return json({ error: "개발관리자만 계정 상태를 변경할 수 있습니다." }, 403);
      if (targetId === caller.id) return json({ error: "현재 로그인한 본인 계정은 사용 중지할 수 없습니다." }, 400);
      const { error } = await admin.from("customers").update({ blocked }).eq("id", targetId).eq("is_admin", true);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "지원하지 않는 작업입니다." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }, 500);
  }
});
