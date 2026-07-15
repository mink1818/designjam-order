const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
const ADMIN_SESSION_KEY = "designjam_admin_session";

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
  if (!customer?.is_admin || customer.blocked) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await supabaseClient.auth.signOut();
    location.replace("admin.html");
    return;
  }
  document.body.classList.add("auth-ready");
})();
