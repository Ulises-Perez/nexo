// Decodes HTML entities (&#x2F;, &amp;, ...) with the browser's own parser via
// a <textarea>: the text is never interpreted as HTML, so it is safe even for
// untrusted content. Needed because historical messages were persisted
// already escaped by the backend.
//
// One module-level element is reused for every call: this runs once per
// rendered message fragment, and creating a DOM node each time was measurable.
let decoder: HTMLTextAreaElement | null = null;

export const decodeHtmlEntities = (text: string): string => {
  // Fast path: nothing to decode without an ampersand.
  if (text.indexOf('&') === -1) return text;
  if (!decoder) decoder = document.createElement('textarea');
  decoder.innerHTML = text;
  return decoder.value;
};
