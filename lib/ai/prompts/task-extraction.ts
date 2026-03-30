/**
 * Task Extraction Prompts
 * Prompts for extracting task information from transcribed text
 */

export const TASK_EXTRACTION_SYSTEM_PROMPT = `You are an expert task management assistant. Your role is to extract structured task information from natural language input.

Extract the following information:
- title: A clear, concise task title (max 100 characters)
- description: Detailed task description with context
- priority: low, medium, or high (infer from urgency indicators)
- dueDate: ISO 8601 date string if mentioned (e.g., "tomorrow", "next week", "Friday")
- assignees: Array of names mentioned
- tags: Relevant tags/categories (e.g., "meeting", "bug", "feature")
- estimatedHours: Estimated time if mentioned

Rules:
1. If no due date is mentioned, leave it null
2. Infer priority from words like "urgent", "asap", "important", "critical"
3. Extract all mentioned names as potential assignees
4. Generate relevant tags based on task type
5. Keep title concise but descriptive
6. Include all important details in description
7. Use Turkish language context appropriately

Always respond with valid JSON in this exact format:
{
  "title": "string",
  "description": "string",
  "priority": "low" | "medium" | "high",
  "dueDate": "ISO 8601 string or null",
  "assignees": ["string"],
  "tags": ["string"],
  "estimatedHours": number or null
}`;

export const createTaskExtractionPrompt = (transcription: string): string => {
  return `Extract task information from this transcription:

"${transcription}"

Respond with a JSON object containing the extracted task details.`;
};

/**
 * Example prompts for testing
 */
export const TASK_EXTRACTION_EXAMPLES = [
  {
    input: 'Yarın saat 3\'te müşteri toplantısı var, Ahmet ve Mehmet katılacak, sunum hazırlanmalı',
    expected: {
      title: 'Müşteri Toplantısı Sunumu Hazırla',
      description: 'Yarın 15:00\'te müşteri toplantısı için sunum hazırlanacak. Ahmet ve Mehmet katılacak.',
      priority: 'high',
      dueDate: 'tomorrow at 15:00',
      assignees: ['Ahmet', 'Mehmet'],
      tags: ['meeting', 'presentation'],
      estimatedHours: 2,
    },
  },
  {
    input: 'Login butonu çalışmıyor, acil düzeltilmeli',
    expected: {
      title: 'Login Butonu Hatası',
      description: 'Login butonu çalışmıyor ve acil olarak düzeltilmesi gerekiyor.',
      priority: 'high',
      dueDate: null,
      assignees: [],
      tags: ['bug', 'urgent', 'frontend'],
      estimatedHours: 1,
    },
  },
  {
    input: 'Gelecek hafta API dokümantasyonunu güncelle',
    expected: {
      title: 'API Dokümantasyonunu Güncelle',
      description: 'Gelecek hafta API dokümantasyonu güncellenecek.',
      priority: 'medium',
      dueDate: 'next week',
      assignees: [],
      tags: ['documentation', 'api'],
      estimatedHours: 3,
    },
  },
];
