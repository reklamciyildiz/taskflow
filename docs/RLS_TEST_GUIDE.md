# 🧪 RLS Test Kılavuzu

## 📋 Test Öncesi Hazırlık

### **Seçenek 1: Test Project (Supabase Dashboard) - ÖNERİLEN ✅**

**Adımlar:**

1. **Yeni Test Project Oluştur:**
   - https://supabase.com/dashboard
   - "New Project" → "Axiom-Test"
   - Region seç, şifre belirle
   - Create Project (2-3 dk bekle)

2. **Schema'yı Kopyala:**
   - Ana project'te: SQL Editor → `schema.sql` dosyasını çalıştır
   - Test project'te: SQL Editor → Aynı schema'yı yapıştır ve çalıştır

3. **RLS Migration'ı Çalıştır:**
   - Test project → SQL Editor
   - `supabase/migrations/20260114_enable_rls_all_tables.sql` dosyasını aç
   - Tüm içeriği kopyala-yapıştır
   - Run (F5)

4. **Test Environment Variables:**
   ```env
   # .env.local.test (yeni dosya oluştur)
   NEXT_PUBLIC_SUPABASE_URL=https://xxx-test.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (test project)
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (test project)
   NEXTAUTH_SECRET=test-secret-key-123
   NEXTAUTH_URL=http://localhost:3000
   ```

5. **Test Ortamını Başlat:**
   ```bash
   # .env.local'i .env.local.backup olarak kaydet
   mv .env.local .env.local.backup
   
   # Test env'i kullan
   mv .env.local.test .env.local
   
   # Uygulamayı başlat
   npm run dev
   ```

### **Seçenek 2: Direkt Production'da Test (Riskli ⚠️)**

**Sadece çok emin olduğunda kullan!**

```bash
# 1. Production Supabase'de migration'ı çalıştır
# 2. Hemen test et
# 3. Sorun varsa rollback yap
```

---

## ✅ Test Checklist

### **1. Temel Fonksiyonlar**

```bash
# Test sırası:
1. [ ] Login
2. [ ] Dashboard yükleniyor
3. [ ] Task listesi görünüyor
```

### **2. Task İşlemleri**

```bash
1. [ ] Yeni task oluştur
   - Title: "Test Task 1"
   - Description: "RLS Test"
   - Priority: High
   - Status: Todo

2. [ ] Task'ı güncelle
   - Status: Progress
   - Priority: Urgent

3. [ ] Task'ı tamamla
   - Status: Done

4. [ ] Task'ı sil
```

### **3. Customer İşlemleri**

```bash
1. [ ] Yeni customer ekle
   - Name: "Test Customer"
   - Email: "test@example.com"

2. [ ] Customer'ı güncelle
   - Name: "Updated Customer"

3. [ ] Customer'a task ata

4. [ ] Customer'ı sil
```

### **4. Team İşlemleri**

```bash
1. [ ] Team listesi görünüyor
2. [ ] Team member'ları görünüyor
3. [ ] Team değiştir
4. [ ] Yeni team'de task'lar görünüyor
```

### **5. Webhook İşlemleri**

```bash
1. [ ] Integrations sayfası açılıyor
2. [ ] Yeni webhook oluştur
3. [ ] Webhook listesi görünüyor
4. [ ] Webhook'u güncelle (aktif/pasif)
5. [ ] Webhook log'larını görüntüle
6. [ ] Webhook'u sil
```

### **6. Notifications**

```bash
1. [ ] Notification listesi görünüyor
2. [ ] Notification okundu işaretle
3. [ ] Yeni notification geldiğinde görünüyor
```

### **7. Analytics**

```bash
1. [ ] Analytics sayfası açılıyor
2. [ ] Grafikler yükleniyor
3. [ ] İstatistikler doğru
```

### **8. Achievements**

```bash
1. [ ] Achievement listesi görünüyor
2. [ ] User achievement'ları görünüyor
3. [ ] Progress bar'lar çalışıyor
```

---

## 🔍 RLS Doğrulama

### **SQL Sorguları (Supabase SQL Editor)**

```sql
-- 1. RLS durumunu kontrol et
SELECT * FROM check_rls_status();

-- Beklenen sonuç:
-- users: rls_enabled=true, policy_count=2
-- organizations: rls_enabled=true, policy_count=1
-- teams: rls_enabled=true, policy_count=1
-- tasks: rls_enabled=true, policy_count=1
-- customers: rls_enabled=true, policy_count=1
-- notifications: rls_enabled=true, policy_count=2
-- webhooks: rls_enabled=false (intentional)
-- webhook_logs: rls_enabled=false (intentional)

-- 2. Policy'leri listele
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Test: Frontend'den direkt erişim engelleniyor mu?
-- Bu sorgu başarısız olmalı (RLS çalışıyorsa):
SELECT * FROM tasks; -- Should return only tasks user can see
```

---

## 🐛 Hata Senaryoları

### **Senaryo 1: Task Oluşturulamıyor**

**Hata:**
```
Error: new row violates row-level security policy for table "tasks"
```

**Çözüm:**
```sql
-- Service role key doğru mu kontrol et
-- .env.local'de SUPABASE_SERVICE_ROLE_KEY var mı?
```

### **Senaryo 2: Task Listesi Boş**

**Hata:**
```
Tasks array is empty but should have data
```

**Çözüm:**
```sql
-- Policy'de sorun var mı kontrol et
SELECT * FROM pg_policies WHERE tablename = 'tasks';

-- API service role kullanıyor mu kontrol et
-- lib/db.ts'de 'db' (supabaseAdmin) kullanılıyor mu?
```

### **Senaryo 3: Webhook Oluşturulamıyor**

**Hata:**
```
Error: new row violates row-level security policy for table "webhooks"
```

**Çözüm:**
```sql
-- Webhooks için RLS kapalı olmalı
ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs DISABLE ROW LEVEL SECURITY;
```

---

## 📊 Performance Test

```bash
# 1. Task listesi yükleme süresi
# Önce: ~500ms
# Sonra: ~500ms (değişmemeli, service role bypass eder)

# 2. Task oluşturma süresi
# Önce: ~300ms
# Sonra: ~300ms (değişmemeli)

# 3. API response time
# Tüm endpoint'ler aynı hızda çalışmalı
```

---

## ✅ Test Başarılı Kriterleri

### **Tüm bunlar çalışıyorsa başarılı:**

1. ✅ Login çalışıyor
2. ✅ Task CRUD işlemleri çalışıyor
3. ✅ Customer CRUD işlemleri çalışıyor
4. ✅ Team işlemleri çalışıyor
5. ✅ Webhook işlemleri çalışıyor
6. ✅ Notifications çalışıyor
7. ✅ Analytics çalışıyor
8. ✅ Achievements çalışıyor
9. ✅ Hiçbir error log yok
10. ✅ Performance değişmedi

### **SQL Doğrulama:**

```sql
-- Bu sorgu başarılı olmalı:
SELECT * FROM check_rls_status();

-- Sonuç:
-- Tüm tablolar (webhooks hariç): rls_enabled = true
-- Her tablo için en az 1 policy var
```

---

## 🚀 Production'a Geçiş

### **Test başarılıysa:**

1. ✅ Tüm testler geçti
2. ✅ Error log yok
3. ✅ Performance OK
4. ✅ SQL doğrulama OK

### **Production'da çalıştır:**

```sql
-- Supabase Dashboard → SQL Editor
-- 20260114_enable_rls_all_tables.sql dosyasını kopyala-yapıştır
-- Run

-- Doğrula:
SELECT * FROM check_rls_status();
```

### **Monitoring (İlk 24 saat):**

1. **Vercel Logs:**
   - Vercel Dashboard → Logs
   - Error'ları izle

2. **Supabase Logs:**
   - Supabase Dashboard → Logs
   - Query performance izle

3. **User Feedback:**
   - Kullanıcı şikayetleri var mı?
   - Yavaşlama var mı?

---

## 🔄 Rollback (Acil Durum)

### **Eğer sorun çıkarsa:**

```sql
-- HEMEN ÇALIŞTIR:
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;

-- Doğrula:
SELECT * FROM check_rls_status();
-- Tüm tablolar: rls_enabled = false olmalı
```

### **Rollback sonrası:**

1. Log'ları incele
2. Sorunu tespit et
3. Policy'leri düzelt
4. Test ortamında tekrar test et
5. Tekrar dene

---

## 📝 Test Raporu Şablonu

```markdown
# RLS Test Raporu

**Test Tarihi:** 2026-01-14
**Test Ortamı:** Local / Test Project
**Tester:** [İsim]

## Test Sonuçları

### Temel Fonksiyonlar
- [ ] Login: ✅ / ❌
- [ ] Dashboard: ✅ / ❌
- [ ] Task listesi: ✅ / ❌

### Task İşlemleri
- [ ] Create: ✅ / ❌
- [ ] Update: ✅ / ❌
- [ ] Delete: ✅ / ❌

### Customer İşlemleri
- [ ] Create: ✅ / ❌
- [ ] Update: ✅ / ❌
- [ ] Delete: ✅ / ❌

### Webhook İşlemleri
- [ ] Create: ✅ / ❌
- [ ] Update: ✅ / ❌
- [ ] Logs: ✅ / ❌
- [ ] Delete: ✅ / ❌

### SQL Doğrulama
- [ ] RLS enabled: ✅ / ❌
- [ ] Policy count: ✅ / ❌

### Performance
- [ ] Response time: ✅ / ❌
- [ ] No errors: ✅ / ❌

## Sorunlar
[Varsa sorunları yaz]

## Sonuç
[ ] ✅ Production'a geçilebilir
[ ] ❌ Düzeltme gerekiyor

## Notlar
[Ekstra notlar]
```

---

## 🎯 Özet

1. **Test ortamı kur** (local veya test project)
2. **Migration'ı çalıştır**
3. **Tüm özellikleri test et** (checklist)
4. **SQL doğrulama yap**
5. **Performance kontrol et**
6. **Başarılıysa production'a geç**
7. **24 saat izle**
8. **Sorun çıkarsa rollback**

**Başarı kriteri:** Tüm testler geçti + Error yok + Performance OK = ✅ Production'a geç!
