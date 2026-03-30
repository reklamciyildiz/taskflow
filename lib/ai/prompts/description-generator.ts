export const DESCRIPTION_GENERATOR_SYSTEM_PROMPT = `You are an expert project manager and technical writer. Your task is to generate comprehensive, actionable task descriptions.

Guidelines:
- Be specific and actionable
- Include clear acceptance criteria
- Identify technical requirements
- Anticipate potential blockers
- Use professional but clear language
- Format output in structured sections`;

export const createDescriptionPrompt = (
  taskTitle: string,
  context?: {
    projectName?: string;
    existingDescription?: string;
    priority?: string;
    tags?: string[];
  }
): string => {
  let prompt = `Generate a detailed task description for: "${taskTitle}"\n\n`;

  if (context?.projectName) {
    prompt += `Project: ${context.projectName}\n`;
  }

  if (context?.priority) {
    prompt += `Priority: ${context.priority}\n`;
  }

  if (context?.tags && context.tags.length > 0) {
    prompt += `Tags: ${context.tags.join(', ')}\n`;
  }

  if (context?.existingDescription) {
    prompt += `\nExisting description: ${context.existingDescription}\n`;
    prompt += `Please enhance and expand this description.\n\n`;
  } else {
    prompt += `\n`;
  }

  prompt += `Provide the description in the following JSON format:
{
  "overview": "Brief overview of the task (2-3 sentences)",
  "acceptanceCriteria": ["Criterion 1", "Criterion 2", "Criterion 3"],
  "technicalRequirements": ["Requirement 1", "Requirement 2"],
  "potentialBlockers": ["Blocker 1", "Blocker 2"]
}`;

  return prompt;
};
