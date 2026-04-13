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
7. Preserve the user's language context when helpful

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
    input: "Tomorrow at 3 PM there's a customer meeting, Alex and Sam will attend, a presentation needs to be prepared",
    expected: {
      title: 'Prepare Customer Meeting Presentation',
      description: "Prepare a presentation for tomorrow's 15:00 customer meeting. Alex and Sam will attend.",
      priority: 'high',
      dueDate: 'tomorrow at 15:00',
      assignees: ['Alex', 'Sam'],
      tags: ['meeting', 'presentation'],
      estimatedHours: 2,
    },
  },
  {
    input: 'The login button is broken, needs an urgent fix',
    expected: {
      title: 'Fix login button bug',
      description: 'The login button is not working and needs to be fixed urgently.',
      priority: 'high',
      dueDate: null,
      assignees: [],
      tags: ['bug', 'urgent', 'frontend'],
      estimatedHours: 1,
    },
  },
  {
    input: 'Update the API documentation next week',
    expected: {
      title: 'Update API documentation',
      description: 'Update the API documentation next week.',
      priority: 'medium',
      dueDate: 'next week',
      assignees: [],
      tags: ['documentation', 'api'],
      estimatedHours: 3,
    },
  },
];
