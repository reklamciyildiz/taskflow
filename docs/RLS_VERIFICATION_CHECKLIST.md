# ✅ RLS Doğrulama Checklist

## 🎯 Durum: RLS Aktif Edildi!

**Tablolar:**
- ✅ achievements - RLS aktif
- ✅ comments - RLS aktif
- ✅ customers - RLS aktif
- ✅ invitations - RLS aktif
- ✅ notifications - RLS aktif
- ✅ organizations - RLS aktif
- ✅ tasks - RLS aktif
- ✅ team_members - RLS aktif
- ✅ teams - RLS aktif
- ✅ user_achievements - RLS aktif
- ✅ users - RLS aktif
- ⚠️ webhook_logs - UNRESTRICTED (intentional)
- ⚠️ webhooks - UNRESTRICTED (intentional)

---

## 📋 Test Adımları (Sırayla Yap)

### **1. SQL Doğrulama (Supabase SQL Editor)**

```sql
-- RLS durumunu kontrol et
SELECT * FROM check_rls_status();
```

**Beklenen sonuç:**
```
table_name          | rls_enabled | policy_count
--------------------|-------------|-------------
achievements        | true        | 1
comments            | true        | 1
customers           | true        | 1
invitations         | true        | 1
notifications       | true        | 2
organizations       | true        | 1
tasks               | true        | 1
team_members        | true        | 1
teams               | true        | 1
user_achievements   | true        | 2
users               | true        | 2
webhook_logs        | false       | 0  ✅ (intentional)
webhooks            | false       | 0  ✅ (intentional)
```

---

### **2. Uygulama Testi (Production)**

**A. Login Test:**
```bash
1. [ ] Uygulamayı aç: https://taskflow.vercel.app
2. [ ] Login yap
3. [ ] Dashboard yükleniyor mu?
4. [ ] Task listesi görünüyor mu?
```

**B. Task İşlemleri:**
```bash
1. [ ] Yeni task oluştur
   - Title: "RLS Test Task"
   - Priority: High
   - Status: Todo
   - ✅ Başarılı mı?

2. [ ] Task'ı güncelle
   - Status: Progress
   - ✅ Başarılı mı?

3. [ ] Task'ı tamamla
   - Status: Done
   - ✅ Başarılı mı?

4. [ ] Task'ı sil
   - ✅ Başarılı mı?
```

**C. Customer İşlemleri:**
```bash
1. [ ] Customers sayfasına git
2. [ ] Yeni customer ekle
   - Name: "RLS Test Customer"
   - Email: "test@rls.com"
   - ✅ Başarılı mı?

3. [ ] Customer'ı güncelle
   - Name: "Updated Customer"
   - ✅ Başarılı mı?

4. [ ] Customer'ı sil
   - ✅ Başarılı mı?
```

**D. Webhook İşlemleri:**
```bash
1. [ ] Integrations sayfasına git
2. [ ] Webhook listesi görünüyor mu?
3. [ ] Yeni webhook oluştur
   - Name: "RLS Test Webhook"
   - URL: https://webhook.site/unique-id
   - Events: task.created
   - ✅ Başarılı mı?

4. [ ] Webhook'u aktif/pasif yap
   - ✅ Başarılı mı?

5. [ ] Webhook log'larını görüntüle
   - ✅ Görünüyor mu?

6. [ ] Webhook'u sil
   - ✅ Başarılı mı?
```

**E. Notifications:**
```bash
1. [ ] Notification ikonu görünüyor mu?
2. [ ] Notification listesi açılıyor mu?
3. [ ] Notification okundu işaretle
   - ✅ Başarılı mı?
```

**F. Analytics:**
```bash
1. [ ] Analytics sayfasına git
2. [ ] Grafikler yükleniyor mu?
3. [ ] İstatistikler doğru mu?
```

**G. Achievements:**
```bash
1. [ ] Achievements sayfasına git
2. [ ] Achievement listesi görünüyor mu?
3. [ ] Progress bar'lar çalışıyor mu?
```

---

### **3. Error Log Kontrolü**

**A. Vercel Logs:**
```bash
1. Vercel Dashboard → Logs
2. Son 1 saat içindeki error'ları kontrol et
3. [ ] RLS ile ilgili error var mı?
4. [ ] "row-level security" hatası var mı?
```

**B. Supabase Logs:**
```bash
1. Supabase Dashboard → Logs → Postgres Logs
2. Son 1 saat içindeki query'leri kontrol et
3. [ ] Failed query var mı?
4. [ ] RLS policy violation var mı?
```

**C. Browser Console:**
```bash
1. F12 → Console
2. [ ] Error var mı?
3. [ ] API call'lar başarılı mı?
```

---

### **4. Performance Testi**

**Önce/Sonra Karşılaştırma:**

```bash
# Task listesi yükleme süresi
Önce: ~500ms
Sonra: ~500ms ✅ (değişmemeli)

# Task oluşturma süresi
Önce: ~300ms
Sonra: ~300ms ✅ (değişmemeli)

# Dashboard yükleme süresi
Önce: ~1000ms
Sonra: ~1000ms ✅ (değişmemeli)
```

**Test et:**
```bash
1. [ ] Task listesi hızlı yükleniyor mu?
2. [ ] Task oluşturma hızlı mı?
3. [ ] Sayfa geçişleri akıcı mı?
```

---

## ✅ Başarı Kriterleri

### **Tüm bunlar OK olmalı:**

1. ✅ SQL doğrulama başarılı (check_rls_status)
2. ✅ Login çalışıyor
3. ✅ Task CRUD işlemleri çalışıyor
4. ✅ Customer CRUD işlemleri çalışıyor
5. ✅ Webhook işlemleri çalışıyor
6. ✅ Notifications çalışıyor
7. ✅ Analytics çalışıyor
8. ✅ Achievements çalışıyor
9. ✅ Hiçbir error log yok
10. ✅ Performance değişmedi

---

## 🚨 Sorun Tespit Edilirse

### **Senaryo 1: Task Oluşturulamıyor**

**Hata:**
```
Error: new row violates row-level security policy for table "tasks"
```

**Çözüm:**
```sql
-- Service role key doğru mu kontrol et
-- Vercel → Environment Variables → SUPABASE_SERVICE_ROLE_KEY
```

**Test:**
```bash
# .env.local'de var mı?
echo $SUPABASE_SERVICE_ROLE_KEY
```

---

### **Senaryo 2: Task Listesi Boş**

**Hata:**
```
Tasks array is empty but should have data
```

**Çözüm:**
```sql
-- API service role kullanıyor mu kontrol et
-- lib/db.ts'de 'db' (supabaseAdmin) kullanılıyor mu?
```

---

### **Senaryo 3: Webhook Oluşturulamıyor**

**Hata:**
```
Error: new row violates row-level security policy for table "webhooks"
```

**Çözüm:**
```sql
-- Webhooks için RLS kapalı olmalı (zaten kapalı)
-- Kontrol et:
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname IN ('webhooks', 'webhook_logs');

-- Beklenen: relrowsecurity = false
```

---

### **Senaryo 4: Genel RLS Hatası**

**Acil Rollback:**
```sql
-- SADECE ACİL DURUMDA KULLAN!
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;

-- Doğrula:
SELECT * FROM check_rls_status();
```

---

## 📊 Test Raporu Şablonu

```markdown
# RLS Production Test Raporu

**Test Tarihi:** 2026-01-13
**Test Eden:** [İsim]
**Ortam:** Production

## SQL Doğrulama
- [ ] check_rls_status() çalıştı: ✅ / ❌
- [ ] Tüm tablolar RLS enabled: ✅ / ❌
- [ ] Policy count doğru: ✅ / ❌

## Uygulama Testleri
- [ ] Login: ✅ / ❌
- [ ] Task CRUD: ✅ / ❌
- [ ] Customer CRUD: ✅ / ❌
- [ ] Webhook işlemleri: ✅ / ❌
- [ ] Notifications: ✅ / ❌
- [ ] Analytics: ✅ / ❌
- [ ] Achievements: ✅ / ❌

## Error Logs
- [ ] Vercel logs temiz: ✅ / ❌
- [ ] Supabase logs temiz: ✅ / ❌
- [ ] Browser console temiz: ✅ / ❌

## Performance
- [ ] Task listesi hızlı: ✅ / ❌
- [ ] Task oluşturma hızlı: ✅ / ❌
- [ ] Sayfa geçişleri akıcı: ✅ / ❌

## Sorunlar
[Varsa sorunları yaz]

## Sonuç
- [ ] ✅ RLS başarıyla aktif, her şey çalışıyor
- [ ] ⚠️ Küçük sorunlar var, düzeltilmeli
- [ ] ❌ Ciddi sorunlar var, rollback gerekli

## Notlar
[Ekstra notlar]

## İmza
[İsim] - [Tarih]
```

---

## 🎯 Hızlı Test (5 Dakika)

**Minimum test için:**

1. **SQL:**
   ```sql
   SELECT * FROM check_rls_status();
   ```

2. **Uygulama:**
   - Login yap
   - Task oluştur
   - Webhook oluştur
   - Error var mı kontrol et

3. **Sonuç:**
   - ✅ Her şey çalışıyor → Başarılı!
   - ❌ Error var → Detaylı test yap

---

## 📞 Yardım

**Sorun çıkarsa:**
1. Bu checklist'i takip et
2. Error log'larını kontrol et
3. Gerekirse rollback yap
4. Sorunu tespit et ve düzelt

**Başarı göstergeleri:**
- ✅ Tüm testler geçti
- ✅ Error log yok
- ✅ Performance OK
- ✅ Kullanıcılar hiçbir şey farketmedi

---

**ŞİMDİ YAP:** Yukarıdaki testleri sırayla yap ve sonuçları kaydet! 🚀
