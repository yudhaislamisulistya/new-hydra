# New Hydra local stack

Production does not depend on Supabase Cloud. The static Next.js frontend,
GoTrue authentication, PostgREST API, and PostgreSQL database run on this
server. The Supabase JavaScript package is only a browser client for the local
GoTrue and PostgREST protocols; its base URL is https://hydra.sivia.id.

## Services

| Container | Purpose | Host port |
| --- | --- | --- |
| hydra_frontend | Nginx and static frontend | 7108 |
| hydra_postgrest_api | Local REST and RPC API | 8107 |
| hydra_postgres_db | PostgreSQL 15 | 5451 |
| hydra_auth | GoTrue authentication | internal |

Nginx routes /auth/v1 to GoTrue and /rest/v1 to PostgREST.

## Deploy and verify

    docker volume create new-hydra_hydra_postgres_local_data
    docker compose config --quiet
    docker compose up -d --build
    docker compose ps

The database volume is external so docker compose down -v cannot delete it.
Initialization scripts only run when this volume is empty. They restore Auth
users, public data, local RPC functions, and RLS policies.

For an existing database volume, apply new migrations before restarting:

    docker exec -i hydra_postgres_db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/20260823_add_student_study_group.sql
    docker exec -i hydra_postgres_db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/20260823_add_hydration_log_authorship.sql
    docker exec -i hydra_postgres_db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/local-security.sql
    docker exec -i hydra_postgres_db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/20261019_import_evaluations.sql

## Pengisian cepat evaluasi

Siswa: buka **Ayo Jawab**. Admin, guru, dan orang tua: buka **Logbook / Ayo Catat**.
Gunakan **Unduh Template Evaluasi Excel**, isi lembar Pengetahuan dan/atau Sikap,
lalu unggah, periksa pratinjau, dan konfirmasi impor. Satu baris berisi satu
evaluasi lengkap untuk satu siswa dan tanggal catatan asupan. Pilihan bernomor
mengikuti urutan jawaban pada lembar Pertanyaan, bukan nilai benar/salah.

Maksimal 500 evaluasi / 2 MB. Tanggal lampau diperbolehkan, tanggal mendatang
ditolak. Jawaban lama tidak ditimpa, termasuk ketika unggahan diulang. Identitas
pengisi mengikuti akun yang masuk; akses siswa tetap diperiksa di server.
Seluruh unggahan batal jika satu baris tidak valid atau di luar akses.

Kesimpulan hidrasi menggunakan **Total Kebutuhan (FBB × FG + FA)**, bukan FBB.
Ringkasan dashboard dan laporan menggunakan aktivitas sedang (FA 375 ml);
halaman Ayo Catat menggunakan aktivitas yang dipilih pada halaman tersebut.
Akumulasi rentang dibandingkan dengan total kebutuhan seluruh hari pada rentang.

Pengujian:

    npm run test:logbook-excel
    npm run test:evaluation-excel
    docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/evaluation_excel_import.sql

Health checks:

    curl -fsS http://127.0.0.1:7108/
    curl -fsS http://127.0.0.1:7108/auth/v1/health
    curl -fsS 'http://127.0.0.1:7108/rest/v1/schools?select=id&limit=1'

## Revisi 8 November 2026

Sebelum membangun ulang frontend, cadangkan database lalu jalankan migrasi terbaru:

    docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/migrations/20261108_daily_activity_and_evaluation_corrections.sql

Migrasi menyimpan aktivitas per siswa/tanggal, menambahkan jejak koreksi evaluasi,
dan menyediakan RPC untuk timpa/hapus dengan pemeriksaan akses siswa. Entri lama
yang tidak memiliki aktivitas diberi **perkiraan sedang**, bukan aktivitas acak.
Pilihan siswa/guru/orang tua/admin yang disimpan menggantikan perkiraan tersebut.
Total kebutuhan tetap memakai rumus aplikasi FBB × FG + FA (0/375/750 ml).

Admin dapat menyunting/menghapus entri pada riwayat yang dikelompokkan per siswa.
Siswa dapat mengisi ulang/menghapus evaluasi pada tanggal catatan yang dipilih;
impor Excel menyediakan pilihan **Timpa jawaban lama** dengan konfirmasi.
Identitas pengisi asli dan waktu pengiriman tetap disimpan; koreksi mencatat
`updated_by`/`updated_at`. Tanggal pada kedua kolom ekspor mengikuti tanggal
catatan asupan; jam menggunakan WIB. Timestamp asli tidak dimodifikasi.

**Daftar Pengguna → Unduh Data Siswa & Orang Tua (.xlsx)** menghasilkan dua
lembar berisi seluruh data (bukan hanya halaman aktif). File berisi data pribadi;
hanya admin yang dapat mengunduh dan file harus disimpan secara terbatas.

Ikon baru tersedia untuk favicon, Apple Touch, PWA, dan sumber launcher Android.
Prompt dan asal ikon: `public/icons/README.md`. Perubahan sumber Android tidak
otomatis memperbarui APK yang sudah terpasang; APK perlu dibangun ulang.

Pengujian tambahan:

    npm run test:november-revisions
    docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/daily_activity_and_evaluation_corrections.sql

### Rentang aktivitas dengan pembacaan harian

Detail Aktivitas Minum mendukung satu hari, 7/14/30 hari terakhir, dan rentang
khusus maksimal 90 hari. Grafik dan tabel tetap satu data per tanggal, termasuk
tanggal tanpa catatan. Aktivitas, Total Kebutuhan, serta status setiap hari
dihitung terpisah; total volume rentang bukan status hidrasi gabungan.
Pilih tanggal pada tabel/dropdown untuk membaca detail dan koreksi hari itu.
Ekspor ringkasan CSV/PDF juga mempertahankan pembacaan per hari; ekspor catatan
rentang tetap memuat seluruh entri pada rentang tersebut. Tidak ada migrasi baru.

    npm run test:hydration-range

database/auth-data.sql contains password hashes and is excluded from Git.
The pre-migration volume new-hydra_hydra_postgres_data and a validated backup
in /home/new-hydra-backups are retained for rollback. Do not delete them until
the local deployment has completed its retention period.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
