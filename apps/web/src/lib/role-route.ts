export function routeForRole(
  role: string | undefined,
): "/agency/dashboard" | "/client/home" | "/admin/agencies" {
  if (role === "SUPER_ADMIN") return "/admin/agencies";
  if (role === "CLIENT_OWNER" || role === "CLIENT_MEMBER") return "/client/home";
  return "/agency/dashboard";
}
