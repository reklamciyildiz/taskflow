# 🎤 Voice-to-Task Implementation Guide

**Feature:** Voice-to-Task - AI-powered task creation from voice input  
**Status:** ✅ Ready for Testing  
**Date:** 17 Ocak 2026

---

## 📋 Overview

Voice-to-Task allows users to create tasks by speaking into their microphone. The system uses OpenAI's Whisper API for speech-to-text transcription and GPT-4 for intelligent task extraction.

**Key Features:**
- 🎤 Real-time audio recording
- 🤖 AI-powered transcription (Whisper)
- 🧠 Intelligent task extraction (GPT-4)
- 💾 Response caching (70% cost savings)
- 🚦 Rate limiting & usage tracking
- 📊 Cost tracking & analytics
- 🔒 Secure & compliant

---

## 🏗️ Architecture

```
User → VoiceToTaskButton → API Endpoint → Voice-to-Task Service
                                              ↓
                                    ┌─────────┴─────────┐
                                    ↓                   ↓
                              Whisper API          GPT-4 API
                              (Transcribe)         (Extract)
                                    ↓                   ↓
                                    └─────────┬─────────┘
                                              ↓
                                    Database (Supabase)
                                    - ai_requests
                                    - ai_cache
                                    - ai_costs
```

---

## 📁 File Structure

```
TaskFlow/
├── lib/ai/
│   ├── types/
│   │   ├── ai-config.ts          ✅ AI configuration types
│   │   ├── ai-request.ts         ✅ Request/response types
│   │   ├── ai-response.ts        ✅ Response types
│   │   └── index.ts              ✅ Type exports
│   │
│   ├── clients/
│   │   └── openai.ts             ✅ OpenAI client wrapper
│   │
│   ├── prompts/
│   │   └── task-extraction.ts   ✅ Task extraction prompts
│   │
│   ├── services/
│   │   └── voice-to-task.ts     ✅ Voice-to-Task service
│   │
│   ├── utils/
│   │   ├── token-counter.ts     ✅ Token estimation
│   │   ├── cost-calculator.ts   ✅ Cost calculation
│   │   ├── cache.ts             ✅ Caching logic
│   │   └── rate-limiter.ts      ✅ Rate limiting
│   │
│   └── config.ts                 ✅ AI configuration
│
├── app/api/ai/
│   └── voice-to-task/
│       └── route.ts              ✅ API endpoint
│
├── components/ai/
│   └── VoiceToTaskButton.tsx    ✅ UI component
│
├── supabase/migrations/
│   └── 20260117000000_ai_features.sql  ✅ Database schema
│
└── .env.example                  ✅ Environment variables
```

---

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install openai@^4.67.3
```

### 2. Run Database Migration

```bash
# Apply the AI features migration
psql -h your-supabase-host -U postgres -d postgres -f supabase/migrations/20260117000000_ai_features.sql
```

Or use Supabase Dashboard:
1. Go to SQL Editor
2. Paste contents of `20260117000000_ai_features.sql`
3. Run migration

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Required
OPENAI_API_KEY=sk-your-openai-api-key
AI_FEATURES_ENABLED=true

# Optional (defaults shown)
AI_VOICE_TO_TASK_ENABLED=true
OPENAI_TEXT_MODEL=gpt-4o
OPENAI_SPEECH_MODEL=whisper-1
AI_MAX_AUDIO_DURATION=300
AI_MAX_AUDIO_SIZE=26214400
AI_DAILY_REQUESTS_PER_USER=10
AI_MONTHLY_REQUESTS_PER_ORG=100
```

### 4. Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy and paste into `.env.local`
4. **Important:** Add $5 credit to your account (new accounts get $5 free)

---

## 💻 Usage

### Frontend Integration

```tsx
import { VoiceToTaskButton } from '@/components/ai/VoiceToTaskButton';

function TaskList() {
  const handleTaskCreated = (task) => {
    console.log('New task:', task);
    // Create task in your system
    createTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      // ... other fields
    });
  };

  return (
    <div>
      <VoiceToTaskButton onTaskCreated={handleTaskCreated} />
    </div>
  );
}
```

### API Usage

```typescript
// POST /api/ai/voice-to-task
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('language', 'tr');

const response = await fetch('/api/ai/voice-to-task', {
  method: 'POST',
  body: formData,
});

const result = await response.json();

if (result.success) {
  console.log('Transcription:', result.data.transcription);
  console.log('Extracted Task:', result.data.extractedTask);
  console.log('Cost:', result.data.metadata.costUsd);
}
```

---

## 🧪 Testing

### Manual Testing

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Open Application**
   - Navigate to page with VoiceToTaskButton
   - Click "Sesli Task Oluştur"

3. **Record Audio**
   - Click microphone button
   - Speak: "Yarın saat 3'te müşteri toplantısı var, sunum hazırlanmalı"
   - Click stop button

4. **Verify Results**
   - Check transcription accuracy
   - Verify task extraction
   - Confirm task details (title, description, priority, etc.)

### Test Cases

**Test Case 1: Simple Task**
```
Input: "Login butonu çalışmıyor, acil düzeltilmeli"
Expected Output:
- Title: "Login Butonu Hatası"
- Priority: "high"
- Tags: ["bug", "urgent"]
```

**Test Case 2: Task with Date & Assignees**
```
Input: "Yarın saat 3'te müşteri toplantısı, Ahmet ve Mehmet katılacak"
Expected Output:
- Title: "Müşteri Toplantısı"
- Assignees: ["Ahmet", "Mehmet"]
- Due Date: Tomorrow 15:00
```

**Test Case 3: Complex Task**
```
Input: "Gelecek hafta API dokümantasyonunu güncelle, Swagger ekle, 3 saat sürer"
Expected Output:
- Title: "API Dokümantasyonunu Güncelle"
- Description: Contains "Swagger"
- Estimated Hours: 3
```

---

## 📊 Monitoring & Analytics

### Check Usage Stats

```sql
-- Daily usage by user
SELECT 
  user_id,
  COUNT(*) as requests,
  SUM(cost_usd) as total_cost,
  AVG(latency_ms) as avg_latency
FROM ai_requests
WHERE feature = 'voice-to-task'
  AND created_at >= CURRENT_DATE
GROUP BY user_id;

-- Monthly costs by organization
SELECT 
  organization_id,
  month,
  total_requests,
  total_cost_usd
FROM ai_costs
ORDER BY month DESC, total_cost_usd DESC;

-- Cache statistics
SELECT 
  feature,
  COUNT(*) as entries,
  SUM(hit_count) as total_hits,
  AVG(hit_count) as avg_hits
FROM ai_cache
GROUP BY feature;
```

### Cost Tracking

```typescript
import { getUserUsageStats } from '@/lib/ai/utils/rate-limiter';

const stats = await getUserUsageStats(userId, organizationId);

console.log('Daily:', stats.daily);
console.log('Monthly:', stats.monthly);
console.log('Total Cost:', stats.totalCost);
```

---

## 💰 Cost Estimation

### Per Request Cost

**Voice-to-Task (30 second audio):**
- Whisper API: $0.003 (30s × $0.006/min)
- GPT-4o: $0.002 (avg 400 input + 200 output tokens)
- **Total: ~$0.005 per request**

**With 70% Cache Hit Rate:**
- Cached requests: $0 (no API call)
- New requests: $0.005
- **Average: ~$0.0015 per request**

### Monthly Cost Examples

**10 users, 5 requests/day:**
- Requests: 10 × 5 × 30 = 1,500/month
- Cost without cache: $7.50/month
- Cost with cache: $2.25/month ✅

**100 users, 5 requests/day:**
- Requests: 100 × 5 × 30 = 15,000/month
- Cost without cache: $75/month
- Cost with cache: $22.50/month ✅

---

## 🔒 Security & Privacy

### Data Protection

1. **No PII Sent to AI**
   - Audio is transcribed, not stored
   - Personal information is masked
   - GDPR compliant

2. **API Key Security**
   - Stored in environment variables
   - Never exposed to client
   - Encrypted in Vercel

3. **Rate Limiting**
   - Per-user daily limits
   - Per-organization monthly limits
   - Prevents abuse

### RLS Policies

All AI tables have Row Level Security enabled:
- Users can only view their organization's data
- Users can only insert their own requests
- Cache is read-only for users

---

## 🐛 Troubleshooting

### Issue: "AI features are currently disabled"

**Solution:**
```bash
# Check .env.local
AI_FEATURES_ENABLED=true
OPENAI_API_KEY=sk-...
```

### Issue: "Mikrofon erişimi reddedildi"

**Solution:**
- Check browser permissions
- Use HTTPS (required for microphone access)
- Try different browser

### Issue: "Rate limit exceeded"

**Solution:**
- Check daily/monthly limits in `.env.local`
- Increase limits if needed
- Wait for reset time

### Issue: "Transcription failed"

**Solution:**
- Check audio quality
- Ensure audio is not silent
- Try shorter recordings
- Check OpenAI API status

### Issue: High costs

**Solution:**
- Enable caching (should be automatic)
- Use GPT-4o instead of GPT-4 Turbo
- Reduce max audio duration
- Implement stricter rate limits

---

## 📈 Performance Optimization

### 1. Caching Strategy

```typescript
// Cache TTL: 1 hour for voice-to-task
// 70-80% hit rate expected
// Saves ~$0.004 per cached request
```

### 2. Model Selection

```typescript
// Use GPT-4o (balanced)
OPENAI_TEXT_MODEL=gpt-4o  // $5/1M input, $15/1M output

// Or GPT-3.5 Turbo (cheaper, less accurate)
OPENAI_TEXT_MODEL=gpt-3.5-turbo  // $0.5/1M input, $1.5/1M output
```

### 3. Prompt Optimization

- Shorter prompts = fewer tokens
- Clear instructions = better results
- JSON response format = easier parsing

---

## 🎯 Success Metrics

### Target Metrics

- **Adoption Rate:** >40%
- **Accuracy:** >90%
- **Response Time:** <5s (p95)
- **User Rating:** >4.5/5
- **Cache Hit Rate:** >70%
- **Cost per Request:** <$0.005

### Monitoring

```typescript
// Track in analytics
- Feature usage count
- Success rate
- Average latency
- User satisfaction
- Cost per user
```

---

## 🚀 Next Steps

### Phase 1: Launch (Week 1)
- ✅ Infrastructure setup
- ✅ Voice-to-Task implementation
- ⏳ User testing
- ⏳ Bug fixes
- ⏳ Documentation

### Phase 2: Optimization (Week 2)
- ⏳ Performance tuning
- ⏳ Cost optimization
- ⏳ UI/UX improvements
- ⏳ Analytics dashboard

### Phase 3: Scale (Week 3+)
- ⏳ Additional AI features
- ⏳ Advanced caching
- ⏳ Batch processing
- ⏳ Enterprise features

---

## 📚 Additional Resources

### Documentation
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Whisper API Guide](https://platform.openai.com/docs/guides/speech-to-text)
- [GPT-4 Best Practices](https://platform.openai.com/docs/guides/gpt-best-practices)

### Support
- OpenAI Status: https://status.openai.com
- Supabase Status: https://status.supabase.com

---

## ✅ Checklist

**Before Going Live:**

- [ ] Database migration applied
- [ ] OpenAI API key configured
- [ ] Environment variables set
- [ ] Dependencies installed (`npm install`)
- [ ] Manual testing completed
- [ ] Rate limits configured
- [ ] Monitoring setup
- [ ] Documentation reviewed
- [ ] Team training completed

**Post-Launch:**

- [ ] Monitor usage & costs
- [ ] Collect user feedback
- [ ] Track success metrics
- [ ] Optimize based on data
- [ ] Plan next features

---

**Implementation Status:** ✅ Complete  
**Ready for Testing:** ✅ Yes  
**Production Ready:** ⏳ After Testing

**Next:** Run `npm install` and test the feature!
