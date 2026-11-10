const FRAME_STYLE = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
const CLEANUP_AFTER_MS = 60_000;

// Imprime un documento HTML completo desde un iframe oculto: el navegador imprime solo ese
// documento (una hoja) en lugar de la pagina de la aplicacion con todo su contenido.
export const printHtml = (html, { documentRef = document, printDelayMs = 50 } = {}) => {
  const frame = documentRef.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('style', FRAME_STYLE);
  documentRef.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow.document;
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  const cleanup = () => frame.remove();
  frameWindow.addEventListener?.('afterprint', cleanup);
  setTimeout(cleanup, CLEANUP_AFTER_MS);

  setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
  }, printDelayMs);
};
