import sanitizeHtml from 'sanitize-html';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Accepts rich-text HTML from the editor, or plain text from API clients, and returns safe HTML. */
export function sanitizeBody(input: string): string {
  const looksHtml = /<[a-z][\s\S]*>/i.test(input);
  const src = looksHtml ? input : escape(input).replace(/\r?\n/g, '<br>');
  return sanitizeHtml(src, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'blockquote', 'a', 'font', 'h1', 'h2', 'h3'],
    allowedAttributes: { a: ['href'], font: ['size'], '*': ['style'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  });
}

export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|blockquote|h[1-6])>/gi, '\n');
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decode(stripped).replace(/\n{3,}/g, '\n\n').trim();
}

export const makePreview = (html: string): string => htmlToText(html).replace(/\s+/g, ' ').slice(0, 140);
