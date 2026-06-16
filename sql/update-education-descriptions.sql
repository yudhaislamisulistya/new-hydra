-- =====================================================================
-- Update deskripsi materi edukasi (Ayo Belajar) sesuai hasil uji panel ahli.
-- Deskripsi video disimpan di kolom `content` tabel `education_materials`,
-- jadi perubahan ini TIDAK bisa lewat kode — jalankan SQL ini di Supabase.
--
-- LANGKAH 1: cek dulu judul materi yang ada agar WHERE-nya cocok:
--   SELECT id, title FROM education_materials ORDER BY created_at;
-- Lalu sesuaikan klausa WHERE ... ILIKE '%...%' di bawah bila perlu,
-- atau ganti dengan: WHERE id = '<uuid-materi>'.
-- =====================================================================

-- 1) KONSEP AIR DAN KESEIMBANGAN CAIRAN
UPDATE education_materials
SET content = 'Air adalah komponen utama tubuh yang penting bagi fungsi organ tubuh. Keseimbangan cairan tercapai saat asupan air setara dengan pengeluaran melalui urine, keringat, serta pernapasan. Menjaga keseimbangan tubuh sangat penting untuk mencegah kekurangan cairan atau dehidrasi, mendukung metabolisme atau tubuh bekerja, dan menjaga suhu tubuh tetap normal.'
WHERE title ILIKE '%konsep%' OR title ILIKE '%keseimbangan cairan%';

-- 2) KEBUTUHAN ASUPAN CAIRAN
UPDATE education_materials
SET content = 'Secara umum, anak-anak membutuhkan cairan atau air minum sekitar 1600 – 1800 mililiter atau setara dengan 6-8 gelas per hari. Namun, kebutuhan minum setiap anak berbeda-beda tergantung aktivitas harian, berat badan dan jenis kelamin.'
WHERE title ILIKE '%kebutuhan%';

-- 3) KECUKUPAN DAN KEKURANGAN CAIRAN
UPDATE education_materials
SET content = 'Kecukupan cairan berarti keseimbangan cairan tubuh menjadi baik sehingga tubuh dapat bekerja lebih baik, peredaran darah menjadi lancar dan kerja tubuh berjalan dengan baik. Sebaliknya, jika kekurangan cairan atau dehidrasi dapat mengganggu keseimbangan tubuh, menimbulkan gejala ringan seperti lemas dan pusing, hingga serius yang dapat membahayakan kesehatan tubuh.'
WHERE title ILIKE '%kecukupan%';

-- 4) JENIS MINUMAN SEHAT
UPDATE education_materials
SET content = 'Air putih adalah pilihan minuman sehat terbaik untuk menjaga keseimbangan cairan tubuh. Air putih dapat berupa air matang (yang direbus dahulu) maupun air minum kemasan maupun isi ulang. Selain itu, jenis minuman sehat lainnya meliputi susu murni, teh dan jus buah tanpa gula serta air kelapa alami. Minum minuman manis harus dibatasi, jika tidak dapat mengganggu kesehatan kita.'
WHERE title ILIKE '%minuman sehat%' OR title ILIKE '%jenis minuman%';

-- 5) DAMPAK KEKURANGAN CAIRAN
UPDATE education_materials
SET content = 'Kekurangan cairan atau dehidrasi berdampak negatif pada fungsi tubuh. Gejala awalnya meliputi lemas, rasa haus, bibir pecah-pecah, mulut kering dan sakit kepala. Kekurangan cairan selama di sekolah dapat menyebabkan lelah, mengantuk dan mengganggu konsentrasi belajar. Jika mengalami kekurangan cairan terus menerus dapat menyebabkan gangguan organ tubuh seperti otak, jantung, paru-paru, hati dan gangguan ginjal seperti infeksi saluran kemih, batu ginjal dan gagal ginjal.'
WHERE title ILIKE '%dampak%';
