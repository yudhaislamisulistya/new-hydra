export function userError(error: unknown, fallback = "Terjadi kesalahan. Silakan coba lagi."): string {
  const value = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  const message = value.message || "";
  if (value.code === "invalid_credentials" || /invalid login credentials|invalid credentials/i.test(message)) return "Nama pengguna atau kata sandi salah.";
  if (/email not confirmed/i.test(message)) return "Akun belum dikonfirmasi. Silakan hubungi admin.";
  if (/already registered|already exists|duplicate key|user_already_exists/i.test(message)) return "Data atau nama pengguna sudah terdaftar.";
  if (/rate limit|too many|over_request_rate_limit/i.test(message)) return "Terlalu banyak percobaan. Tunggu beberapa saat, lalu coba lagi.";
  if (/password.*(short|least|weak)|weak_password/i.test(message)) return "Kata sandi terlalu lemah. Gunakan sedikitnya 6 karakter.";
  if (/fetch|network|load failed|timeout|timed out/i.test(message)) return "Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.";
  if (/jwt|token.*expired|session.*missing/i.test(message)) return "Sesi masuk telah berakhir. Silakan masuk kembali.";
  if (value.code === "42501" || /permission denied|row-level security/i.test(message)) return "Anda tidak memiliki izin untuk mengakses atau mengubah data ini.";
  if (value.code === "23503") return "Data masih terkait dengan data lain atau sudah berubah. Muat ulang halaman terlebih dahulu.";
  // Show application-authored Indonesian validation, never untranslated database/Auth internals.
  return /^(Silakan|Tanggal|Jawaban|Evaluasi|Anda|Data|Isi|Jumlah|Soal|Template|Pilih|Nama|Kata|Gagal|Tidak|Ukuran|Gunakan|Akun|Nomor|Format|Kode|Kolom|Sekolah|Berat|Tinggi|Umur|Penghasilan|Semua|Aktivitas)\b/.test(message) ? message : fallback;
}

export function responseDateTime(date: string, submittedAt: string) {
  const time = new Date(submittedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  return `${new Date(`${date}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })} ${time} WIB`;
}

export function questionTypeLabel(type: string) {
  return ({ multiple_choice: "Pilihan Ganda", scale: "Skala", text: "Isian Teks" } as Record<string, string>)[type] || "Pertanyaan";
}
