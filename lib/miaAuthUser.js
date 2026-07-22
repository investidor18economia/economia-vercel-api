/**
 * PATCH 3.3A / 3.3A.1 — Verified user resolution after OTP success.
 */

export async function findUserByEmail(supabase, emailNormalized) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email_normalized", emailNormalized)
    .limit(1);

  if (error) throw error;
  if (data?.[0]) return data[0];

  const { data: legacyData, error: legacyError } = await supabase
    .from("users")
    .select("*")
    .eq("email", emailNormalized)
    .limit(1);

  if (legacyError) throw legacyError;
  return legacyData?.[0] || null;
}

export async function resolveVerifiedUser(
  supabase,
  { emailNormalized, pendingName = "" } = {},
  now = new Date().toISOString()
) {
  const existing = await findUserByEmail(supabase, emailNormalized);
  const trimmedName = String(pendingName || "").trim();

  if (existing) {
    const updates = {
      email_verified_at: existing.email_verified_at || now,
      email_normalized: existing.email_normalized || emailNormalized,
    };

    if (trimmedName && !String(existing.name || "").trim()) {
      updates.name = trimmedName;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .limit(1);

    if (error) throw error;
    return { user: data?.[0] || existing, created: false };
  }

  const insertPayload = {
    email: emailNormalized,
    email_normalized: emailNormalized,
    name: trimmedName || null,
    email_verified_at: now,
    created_at: now,
  };

  const { data, error } = await supabase.from("users").insert([insertPayload]).select().limit(1);
  if (error) throw error;

  return { user: data?.[0] || null, created: true };
}
