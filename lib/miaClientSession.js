export function buildUserSessionHeaders(user, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (user?.session_token) {
    headers.Authorization = `Bearer ${user.session_token}`;
  }
  return headers;
}
