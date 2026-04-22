# 🔔 Axiom Webhook & API Documentation

**Version:** 1.0  
**Last Updated:** 13 Ocak 2026

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Webhook Management API](#webhook-management-api)
4. [Webhook Events](#webhook-events)
5. [Webhook Payload Structure](#webhook-payload-structure)
6. [Security & Signature Verification](#security--signature-verification)
7. [Retry Mechanism](#retry-mechanism)
8. [Rate Limits](#rate-limits)
9. [Examples](#examples)

---

## 🎯 Overview

Axiom Webhook & API sistemi, uygulamanızdaki önemli olayları (task oluşturma, güncelleme, silme vb.) gerçek zamanlı olarak dış sistemlere bildirmenizi sağlar.

### Key Features:
- ✅ **12 farklı event tipi** (task, customer, team events)
- ✅ **HMAC-SHA256 signature verification** (güvenlik)
- ✅ **Automatic retry mechanism** (3 deneme, üstel geri çekilme)
- ✅ **Detailed logging** (her webhook çağrısı kaydedilir)
- ✅ **Per-organization webhooks** (her organizasyon kendi webhook'larını yönetir)

---

## 🔐 Authentication

Tüm API endpoint'leri **NextAuth session** ile korunmaktadır. İsteklerinizde geçerli bir session cookie'si bulunmalıdır.

### Required Headers:
```http
Cookie: next-auth.session-token=<your-session-token>
```

### Permissions:
- **Webhook oluşturma/güncelleme/silme:** Admin veya Owner rolü gereklidir
- **Webhook listeleme/görüntüleme:** Tüm kullanıcılar kendi organizasyonlarının webhook'larını görebilir

---

## 🔧 Webhook Management API

### 1. List All Webhooks

**Endpoint:** `GET /api/webhooks`

**Description:** Organizasyonunuza ait tüm webhook'ları listeler.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Zapier Integration",
      "url": "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
      "events": ["task.created", "task.updated"],
      "active": true,
      "secret": "whsec_...",
      "organizationId": "uuid",
      "createdBy": "uuid",
      "createdAt": "2026-01-13T10:00:00Z",
      "updatedAt": "2026-01-13T10:00:00Z"
    }
  ]
}
```

---

### 2. Create Webhook

**Endpoint:** `POST /api/webhooks`

**Description:** Yeni bir webhook oluşturur.

**Request Body:**
```json
{
  "name": "My Webhook",
  "url": "https://your-app.com/webhook-endpoint",
  "events": ["task.created", "task.completed"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Webhook",
    "url": "https://your-app.com/webhook-endpoint",
    "events": ["task.created", "task.completed"],
    "active": true,
    "secret": "whsec_a1b2c3d4e5f6...",
    "organizationId": "uuid",
    "createdBy": "uuid",
    "createdAt": "2026-01-13T10:00:00Z",
    "updatedAt": "2026-01-13T10:00:00Z"
  },
  "message": "Webhook created successfully"
}
```

**Important:** `secret` değerini güvenli bir yerde saklayın! Bu değer webhook imzalarını doğrulamak için kullanılır.

---

### 3. Get Webhook Details

**Endpoint:** `GET /api/webhooks/{id}`

**Description:** Belirli bir webhook'un detaylarını getirir.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Webhook",
    "url": "https://your-app.com/webhook-endpoint",
    "events": ["task.created"],
    "active": true,
    "secret": "whsec_...",
    "organizationId": "uuid",
    "createdBy": "uuid",
    "createdAt": "2026-01-13T10:00:00Z",
    "updatedAt": "2026-01-13T10:00:00Z"
  }
}
```

---

### 4. Update Webhook

**Endpoint:** `PATCH /api/webhooks/{id}`

**Description:** Mevcut bir webhook'u günceller.

**Request Body:**
```json
{
  "name": "Updated Webhook Name",
  "url": "https://new-url.com/webhook",
  "events": ["task.created", "task.updated", "task.deleted"],
  "active": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Webhook Name",
    "url": "https://new-url.com/webhook",
    "events": ["task.created", "task.updated", "task.deleted"],
    "active": false,
    ...
  },
  "message": "Webhook updated successfully"
}
```

---

### 5. Delete Webhook

**Endpoint:** `DELETE /api/webhooks/{id}`

**Description:** Webhook'u kalıcı olarak siler.

**Response:**
```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

---

### 6. Get Webhook Logs

**Endpoint:** `GET /api/webhooks/{id}/logs?limit=50`

**Description:** Webhook'un delivery log'larını getirir.

**Query Parameters:**
- `limit` (optional): Kaç log getirileceği (default: 50, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "webhookId": "uuid",
      "event": "task.created",
      "payload": { ... },
      "response": {
        "status": 200,
        "body": "OK"
      },
      "success": true,
      "attempts": 1,
      "nextRetryAt": null,
      "createdAt": "2026-01-13T10:00:00Z"
    }
  ]
}
```

---

## 📡 Webhook Events

Axiom aşağıdaki event'leri destekler:

### Task Events

| Event | Description | Trigger |
|-------|-------------|---------|
| `task.created` | Yeni task oluşturulduğunda | Task create API çağrısı |
| `task.updated` | Task güncellendiğinde | Task update API çağrısı |
| `task.deleted` | Task silindiğinde | Task delete API çağrısı |
| `task.completed` | Task tamamlandığında (status: done) | Task status'u "done" olduğunda |
| `task.assigned` | Task birine atandığında | Task assigneeId set edildiğinde |

### Customer Events

| Event | Description | Trigger |
|-------|-------------|---------|
| `customer.created` | Yeni customer oluşturulduğunda | Customer create API çağrısı |
| `customer.updated` | Customer güncellendiğinde | Customer update API çağrısı |
| `customer.deleted` | Customer silindiğinde | Customer delete API çağrısı |

### Team Events

| Event | Description | Trigger |
|-------|-------------|---------|
| `team.created` | Yeni team oluşturulduğunda | Team create API çağrısı |
| `team.updated` | Team güncellendiğinde | Team update API çağrısı |
| `team.member_added` | Team'e member eklendiğinde | Member add API çağrısı |
| `team.member_removed` | Team'den member çıkarıldığında | Member remove API çağrısı |

---

## 📦 Webhook Payload Structure

Tüm webhook payload'ları aşağıdaki genel yapıya sahiptir:

```typescript
{
  "event": "task.created",           // Event tipi
  "timestamp": "2026-01-13T10:00:00Z", // ISO 8601 format
  "organizationId": "uuid",          // Organization ID
  "data": {                          // Event-specific data
    // Event'e özel veri
  }
}
```

### Task Created Event

```json
{
  "event": "task.created",
  "timestamp": "2026-01-13T10:00:00Z",
  "organizationId": "uuid",
  "data": {
    "task": {
      "id": "uuid",
      "title": "Fix login bug",
      "description": "Users can't login with Google",
      "status": "todo",
      "priority": "high",
      "dueDate": "2026-01-15T00:00:00Z",
      "assigneeId": "uuid",
      "customerId": "uuid",
      "teamId": "uuid",
      "createdBy": "uuid"
    }
  }
}
```

### Task Updated Event

```json
{
  "event": "task.updated",
  "timestamp": "2026-01-13T10:00:00Z",
  "organizationId": "uuid",
  "data": {
    "task": {
      "id": "uuid",
      "title": "Fix login bug",
      "description": "Users can't login with Google",
      "status": "progress",
      "priority": "urgent",
      "dueDate": "2026-01-15T00:00:00Z",
      "assigneeId": "uuid",
      "customerId": "uuid",
      "teamId": "uuid"
    },
    "changes": [
      {
        "field": "status",
        "oldValue": "todo",
        "newValue": "progress"
      },
      {
        "field": "priority",
        "oldValue": "high",
        "newValue": "urgent"
      }
    ]
  }
}
```

### Task Completed Event

```json
{
  "event": "task.completed",
  "timestamp": "2026-01-13T10:00:00Z",
  "organizationId": "uuid",
  "data": {
    "task": {
      "id": "uuid",
      "title": "Fix login bug",
      "completedBy": "uuid",
      "completedAt": "2026-01-13T10:00:00Z"
    }
  }
}
```

### Task Deleted Event

```json
{
  "event": "task.deleted",
  "timestamp": "2026-01-13T10:00:00Z",
  "organizationId": "uuid",
  "data": {
    "taskId": "uuid",
    "teamId": "uuid"
  }
}
```

---

## 🔒 Security & Signature Verification

Her webhook isteği **HMAC-SHA256** ile imzalanır. Bu imza `X-Webhook-Signature` header'ında gönderilir.

### Verifying Webhook Signatures

**Node.js Example:**

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js middleware
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  const secret = 'whsec_your_webhook_secret';
  
  if (!verifyWebhookSignature(payload, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  console.log('Event:', req.body.event);
  console.log('Data:', req.body.data);
  
  res.status(200).json({ received: true });
});
```

**Python Example:**

```python
import hmac
import hashlib

def verify_webhook_signature(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)

# Flask example
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    payload = request.get_data(as_text=True)
    secret = 'whsec_your_webhook_secret'
    
    if not verify_webhook_signature(payload, signature, secret):
        return jsonify({'error': 'Invalid signature'}), 401
    
    data = request.get_json()
    print(f"Event: {data['event']}")
    print(f"Data: {data['data']}")
    
    return jsonify({'received': True}), 200
```

---

## 🔄 Retry Mechanism

Webhook delivery başarısız olursa, otomatik retry mekanizması devreye girer:

### Retry Configuration:
- **Max Attempts:** 3
- **Retry Delays:** 1 dakika, 5 dakika, 15 dakika
- **Timeout:** 10 saniye

### Retry Logic:
1. **İlk deneme:** Webhook hemen gönderilir
2. **Başarısız olursa:** 1 dakika sonra tekrar denenir
3. **Yine başarısız olursa:** 5 dakika sonra tekrar denenir
4. **Son deneme:** 15 dakika sonra son kez denenir
5. **Hala başarısız:** Webhook permanently failed olarak işaretlenir

### Success Criteria:
- HTTP status code: 200-299 arası
- Response timeout: 10 saniye içinde

---

## ⚡ Rate Limits

- **Webhook creation:** 10 webhook/organization
- **Webhook delivery:** Sınırsız (ancak timeout: 10 saniye)
- **Log retention:** 30 gün (otomatik temizleme)

---

## 💡 Examples

### Example 1: Zapier Integration

```javascript
// Zapier webhook URL'inizi Axiom'a ekleyin
POST /api/webhooks
{
  "name": "Zapier - Slack Notification",
  "url": "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
  "events": ["task.created", "task.completed"]
}

// Zapier'da:
// 1. Webhook by Zapier trigger seçin
// 2. URL'i kopyalayın ve Axiom'a ekleyin
// 3. Slack action ekleyin
// 4. Task oluşturulduğunda Slack'te bildirim alın!
```

### Example 2: Custom Node.js Server

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = 'whsec_your_secret_from_taskflow';

function verifySignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

app.post('/taskflow-webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  
  if (!verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, data } = req.body;
  
  switch (event) {
    case 'task.created':
      console.log('New task:', data.task.title);
      // Send email, create Jira ticket, etc.
      break;
      
    case 'task.completed':
      console.log('Task completed:', data.task.title);
      // Update CRM, send invoice, etc.
      break;
      
    default:
      console.log('Unknown event:', event);
  }
  
  res.status(200).json({ received: true });
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

### Example 3: Make.com (Integromat) Integration

```
1. Make.com'da yeni scenario oluşturun
2. "Webhooks" modülünü seçin
3. "Custom webhook" oluşturun
4. URL'i kopyalayın
5. Axiom'da webhook oluşturun:
   - URL: Make.com webhook URL'i
   - Events: İstediğiniz event'ler
6. Make.com'da istediğiniz action'ları ekleyin
   (Google Sheets, Airtable, Email, vb.)
```

---

## 🐛 Troubleshooting

### Webhook çalışmıyor?

1. **URL doğru mu?** HTTPS kullanmalısınız (localhost hariç)
2. **Signature doğrulanıyor mu?** Secret'i doğru kullandığınızdan emin olun
3. **Timeout?** Endpoint'iniz 10 saniye içinde cevap vermeli
4. **Logs kontrol edin:** `/api/webhooks/{id}/logs` endpoint'inden log'ları inceleyin

### Common Errors:

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid signature | Secret'i kontrol edin |
| 408 Timeout | Endpoint çok yavaş | Response süresini azaltın |
| 500 Server Error | Endpoint hatalı | Server log'larını kontrol edin |

---

## 📞 Support

Webhook entegrasyonu ile ilgili sorularınız için:
- GitHub Issues: [Axiom Repository]
- Email: support@taskflow.com
- Documentation: [Full API Docs]

---

**Happy Integrating! 🚀**
