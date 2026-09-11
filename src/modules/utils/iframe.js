export function getAccessibleIframeContext(iframe) {
  try {
    const iframeDocument = iframe?.contentDocument;
    if (!iframeDocument?.defaultView) return null;

    return {
      document: iframeDocument,
      window: iframeDocument.defaultView
    };
  } catch {
    return null;
  }
}
