const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
const ADMIN_SESSION_KEY = "designjam_admin_session";

const DESIGNJAM_ADMIN_EMAILS = new Set([
  "900smk@naver.com",
  "sm0727sm@hanmail.net",
  "p1028p@naver.com"
]);

function isDesignjamAdminEmail(email) {
  return DESIGNJAM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

(async function guardAdminHome() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const sessionUserId = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!user || sessionUserId !== user.id) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (user) await supabaseClient.auth.signOut();
    location.replace("admin.html");
    return;
  }
  const { data: customer } = await supabaseClient.from("customers").select("is_admin, blocked").eq("id", user.id).single();
  const emailAllowed = isDesignjamAdminEmail(user.email);
  const databaseAllowed = customer?.is_admin === true && customer?.blocked !== true;
  if (!emailAllowed && !databaseAllowed) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await supabaseClient.auth.signOut();
    location.replace("admin.html");
    return;
  }
  document.body.classList.add("auth-ready");
})();
