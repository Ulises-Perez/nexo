// Decodifica entidades HTML (&#x2F;, &amp;, etc.) usando el propio parser del
// navegador vía un <textarea> — nunca se interpreta como HTML, así que es
// seguro incluso con contenido no confiable. Necesario porque mensajes
// históricos quedaron persistidos ya escapados en el backend.
export const decodeHtmlEntities = (text: string): string => {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
};
