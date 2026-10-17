export type SafeDescriptionBlock = {
  type: 'heading' | 'paragraph' | 'list-item';
  text: string;
};

/**
 * Parses the tiny markdown subset emitted by the legacy description generator.
 * The returned values are plain text and must be rendered as React text nodes.
 * Deliberately does not interpret or return HTML.
 */
export function parseSafeDescription(value: string): SafeDescriptionBlock[] {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('## ')) {
        return { type: 'heading' as const, text: line.slice(3).trim() };
      }
      if (line.startsWith('- ')) {
        return { type: 'list-item' as const, text: line.slice(2).trim() };
      }
      return { type: 'paragraph' as const, text: line };
    });
}
