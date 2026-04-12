import type {} from 'react';

/**
 * @types/react 18.2.x does not declare `enterKeyHint` on textarea attributes, but it is valid HTML
 * (HTMLElement / HTMLTextAreaElement) and improves mobile keyboard action labels.
 * This declaration merges into React.TextareaHTMLAttributes<T> for all <textarea> and shadcn Textarea.
 */
declare module 'react' {
  interface TextareaHTMLAttributes<T> {
    enterKeyHint?: HTMLTextAreaElement['enterKeyHint'];
  }
}
