# 🔒 TaskFlow Güvenlik Önerileri ve İyileştirmeler

## ✅ Şu An Yapılması Gerekenler (Öncelikli)

### 1. **Service Role Key Kullanımı** ⭐⭐⭐⭐⭐
**Sorun:** API route'ları normal Supabase client kullanıyor, RLS bypass edilemiyor.  
**Çözüm:** Service role key ile admin client oluştur.

**Uygulama:**
```typescript
// lib/supabase-admin.ts (YENİ DOSYA)
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // .env.local'e ekle
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

**Gerekli .env.local değişkeni:**
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
*(Supabase Dashboard → Settings → API → service_role key)*

**Kullanım:**
```typescript
// lib/db.ts'de değişiklik
import { supabaseAdmin } from './supabase-admin';

export const taskDb = {
  async create(task: any) {
    const { data, error } = await supabaseAdmin // supabase yerine
      .from('tasks')
      .insert(task)
      .select()
      .single();
    // ...
  }
}
```

**Avantajlar:**
- ✅ RLS'i bypass eder (güvenli şekilde)
- ✅ Tüm tablolara erişim
- ✅ Performance artışı (RLS check yok)
- ✅ Daha az hata

---

### 2. **RLS Policy'lerini Düzgün Kur** ⭐⭐⭐⭐
**Sorun:** Şu an UNRESTRICTED tablolar var, frontend'den direkt erişilebilir.  
**Çözüm:** Tüm tablolara RLS ekle, API'lerde service role kullan.

**Uygulanacak Tablolar:**
```sql
-- Tüm tablolar için RLS aktif et
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Her tablo için policy'ler
CREATE POLICY "Users can view their own data"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can view their team's tasks"
  ON tasks FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Diğer tablolar için benzer policy'ler...
```

**NOT:** API route'ları service role kullandığı için RLS'i bypass eder, frontend'den direkt erişim engellenir.

---

### 3. **Environment Variables Güvenliği** ⭐⭐⭐⭐
**Sorun:** Hassas bilgiler kod içinde veya client-side'da olabilir.  
**Çözüm:** Tüm secret'ları .env.local'de tut.

**Kontrol Listesi:**
```env
# .env.local (GİT'E EKLEME!)
NEXTAUTH_SECRET=your-super-secret-key-here
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # YENİ!

# Google OAuth (eğer kullanıyorsan)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

**.gitignore kontrolü:**
```gitignore
.env*.local
.env.local
.env.development.local
.env.production.local
```

---

### 4. **API Rate Limiting** ⭐⭐⭐
**Sorun:** API endpoint'ları sınırsız istek kabul ediyor.  
**Çözüm:** Rate limiting middleware ekle.

**Uygulama:**
```typescript
// lib/rate-limit.ts (YENİ DOSYA)
import { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(req: NextRequest, limit = 100, windowMs = 60000) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return { success: true };
  }

  if (record.count >= limit) {
    return { success: false, resetTime: record.resetTime };
  }

  record.count++;
  return { success: true };
}
```

**API route'larında kullan:**
```typescript
// app/api/tasks/route.ts
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimitResult = rateLimit(request, 50, 60000); // 50 req/min
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }
  // ...
}
```

---

### 5. **Input Validation & Sanitization** ⭐⭐⭐⭐
**Sorun:** API input'ları doğrulanmıyor, SQL injection riski.  
**Çözüm:** Zod ile validation ekle.

**Uygulama:**
```typescript
// lib/validations.ts (YENİ DOSYA)
import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(['todo', 'progress', 'review', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid(),
});

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().startsWith('https://'), // Sadece HTTPS
  events: z.array(z.string()).min(1).max(10),
});
```

**API'de kullan:**
```typescript
// app/api/tasks/route.ts
import { createTaskSchema } from '@/lib/validations';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Validate
  const validation = createTaskSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error },
      { status: 400 }
    );
  }
  
  const validatedData = validation.data;
  // ...
}
```

---

### 6. **CORS Configuration** ⭐⭐⭐
**Sorun:** API'ler her origin'den erişilebilir.  
**Çözüm:** CORS policy ekle.

**Uygulama:**
```typescript
// middleware.ts'ye ekle
export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'http://localhost:3000',
    'https://taskflow.vercel.app',
    'https://your-domain.com'
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    return new NextResponse(null, {
      status: 403,
      statusText: 'Forbidden',
    });
  }
  // ...
}
```

---

### 7. **Webhook Security Enhancements** ⭐⭐⭐⭐
**Sorun:** Webhook URL'leri doğrulanmıyor.  
**Çözüm:** URL validation ve test endpoint.

**Uygulama:**
```typescript
// app/api/webhooks/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // URL validation
  if (!body.url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'Webhook URL must use HTTPS' },
      { status: 400 }
    );
  }
  
  // Blacklist check
  const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
  const url = new URL(body.url);
  if (blockedDomains.some(d => url.hostname.includes(d))) {
    return NextResponse.json(
      { error: 'Cannot use localhost URLs in production' },
      { status: 400 }
    );
  }
  
  // Test webhook (optional)
  try {
    const testResponse = await fetch(body.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
      signal: AbortSignal.timeout(5000),
    });
    
    if (!testResponse.ok) {
      console.warn('Webhook test failed:', testResponse.status);
    }
  } catch (error) {
    console.warn('Webhook test error:', error);
  }
  
  // Create webhook...
}
```

---

## 📊 Öncelik Sıralaması

| # | Özellik | Öncelik | Zorluk | Süre | Etki |
|---|---------|---------|--------|------|------|
| 1 | Service Role Key | ⭐⭐⭐⭐⭐ | Kolay | 30 dk | Yüksek |
| 2 | RLS Policy'leri | ⭐⭐⭐⭐ | Orta | 2 saat | Yüksek |
| 3 | Input Validation | ⭐⭐⭐⭐ | Kolay | 1 saat | Orta |
| 4 | Environment Vars | ⭐⭐⭐⭐ | Kolay | 15 dk | Yüksek |
| 5 | Rate Limiting | ⭐⭐⭐ | Orta | 1 saat | Orta |
| 6 | CORS Config | ⭐⭐⭐ | Kolay | 30 dk | Orta |
| 7 | Webhook Security | ⭐⭐⭐⭐ | Kolay | 45 dk | Orta |

---

## 🚀 Hemen Yapılacaklar (Bugün)

1. **Service Role Key Ekle** (30 dk)
   - Supabase'den key al
   - .env.local'e ekle
   - lib/supabase-admin.ts oluştur
   - lib/db.ts'de kullan

2. **Environment Variables Kontrol** (15 dk)
   - .gitignore kontrol et
   - Tüm secret'ları .env.local'e taşı
   - Production'da environment variables set et

3. **Input Validation Başlat** (1 saat)
   - Zod kur: `npm install zod`
   - lib/validations.ts oluştur
   - Kritik API'lere ekle (tasks, webhooks)

---

## 📝 İleride Yapılacaklar (Production Öncesi)

- [ ] RLS policy'lerini tüm tablolara ekle
- [ ] Rate limiting middleware ekle
- [ ] CORS configuration yap
- [ ] Webhook URL validation ekle
- [ ] Security audit yap
- [ ] Penetration testing
- [ ] HTTPS enforce et (production)
- [ ] CSP headers ekle
- [ ] XSS protection headers

---

## ⚠️ Kritik Notlar

1. **Service Role Key:** Asla client-side'da kullanma, sadece API route'larında!
2. **RLS:** Frontend'den direkt Supabase client kullanma, her zaman API üzerinden git
3. **Secrets:** .env.local'i asla git'e commit etme
4. **Production:** Vercel'de environment variables'ı set etmeyi unutma

---

**Sonuç:** Şu an en kritik olan **Service Role Key** eklemek. Diğerleri production öncesi yapılabilir.
