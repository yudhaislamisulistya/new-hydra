import { createClient } from "./api/client";

export async function sendChildNotification(notification: {
  child_id: string;
  sender_parent_id: string;
  title: string;
  message: string;
  type: "reminder" | "feedback";
}) {
  // Returning the ID verifies that the notification was saved and is visible
  // to its sender before the UI reports success.
  const { error } = await createClient()
    .from("child_notifications")
    .insert(notification)
    .select("id")
    .single();

  if (error) throw error;
}

export function getNotificationErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "";

  if (code === "42501") {
    return "Akun Anda tidak memiliki izin mengirim ke siswa ini. Pastikan siswa masih terhubung dengan akun atau sekolah Anda.";
  }
  if (code === "PGRST301" || code === "PGRST303") {
    return "Sesi masuk tidak valid atau sudah berakhir. Silakan masuk kembali.";
  }
  if (code === "23503") {
    return "Data akun atau siswa sudah berubah. Muat ulang halaman, lalu coba lagi.";
  }
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return "Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.";
  }
  return message || "Pengingat belum dapat dikirim. Silakan coba lagi.";
}
