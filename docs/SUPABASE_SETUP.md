# Axiom SaaS - Supabase Kurulum Rehberi

## ✅ Tamamlanan İşler

Kod tarafında tüm SaaS altyapısı hazır:

- ✅ Supabase client (`lib/supabase.ts`)
- ✅ Database types (`lib/database.types.ts`)
- ✅ Database operations (`lib/db.ts`)
- ✅ SQL Schema (`supabase/schema.sql`)
- ✅ API Routes (Supabase entegrasyonu)
- ✅ Multi-tenant yapısı (organization_id)
- ✅ Row Level Security (RLS) kuralları

---

## 🚀 Tek Yapman Gereken: SQL Şemasını Çalıştır

### Adım 1: Supabase SQL Editor'a Git

1. [Supabase Dashboard](https://supabase.com/dashboard/project/ujryiwlfzgdnwgvylzqe) aç
2. Sol menüden **SQL Editor** seç
3. **New Query** butonuna tıkla

### Adım 2: SQL Şemasını Kopyala ve Çalıştır

`supabase/schema.sql` dosyasının içeriğini kopyala ve SQL Editor'a yapıştır.

Sonra **Run** butonuna tıkla.

### Adım 3: Tabloları Kontrol Et

Sol menüden **Table Editor** seç. Şu tabloları görmelisin:

- `organizations`
- `users`
- `teams`
- `team_members`
- `tasks`
- `comments`
- `invitations`

---

## 📝 Demo Veri Ekleme (Opsiyonel)

SQL şemasının sonundaki demo data bölümünü uncomment edip çalıştırabilirsin.

Veya manuel olarak:

```sql
-- Demo Organization
INSERT INTO organizations (id, name, slug) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Demo Company', 'demo-company');

-- Demo User (Owner)
INSERT INTO users (id, email, name, avatar_url, organization_id, role) VALUES 
    ('22222222-2222-2222-2222-222222222222', 'admin@demo.com', 'Admin User', 'https://ui-avatars.com/api/?name=Admin+User', '11111111-1111-1111-1111-111111111111', 'owner');
```

---

## 🔐 RLS Politikaları

Row Level Security (RLS) aktif. Her kullanıcı sadece kendi organizasyonunun verisini görebilir.

Eğer RLS sorun çıkarırsa, test için geçici olarak devre dışı bırakabilirsin:

```sql
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- ... diğer tablolar
```

---

## 🎯 Sonraki Adımlar

1. **SQL şemasını çalıştır** (yukarıdaki adımlar)
2. **Uygulamayı test et** (`npm run dev`)
3. **Kayıt ol** ve yeni organizasyon oluştur
4. **Production'a deploy et** (Vercel önerilir)

---

## 📁 Oluşturulan Dosyalar

```
lib/
├── supabase.ts        # Supabase client
├── database.types.ts  # TypeScript tipleri
├── db.ts              # Veritabanı işlemleri
├── auth.ts            # NextAuth yapılandırması
├── api.ts             # Frontend API client
└── types.ts           # Genel tipler

supabase/
└── schema.sql         # Veritabanı şeması + RLS

app/api/
├── auth/
│   ├── [...nextauth]/route.ts  # NextAuth API
│   └── register/route.ts       # Kayıt API
├── tasks/
│   ├── route.ts                # GET, POST
│   └── [id]/
│       ├── route.ts            # GET, PATCH, DELETE
│       └── comments/route.ts   # POST
└── teams/
    ├── route.ts                # GET, POST
    └── [id]/
        ├── route.ts            # GET, PATCH, DELETE
        └── members/
            ├── route.ts        # GET, POST
            └── [memberId]/route.ts  # PATCH, DELETE
```

---

**SaaS altyapısı hazır! 🎉**
