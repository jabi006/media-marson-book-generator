export function formatHumanReadable(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bPdf\b/g, 'PDF');
}

export function formatStage(stage: string) {
  return formatHumanReadable(stage);
}

export function formatReviewStatus(status: string | null) {
  if (!status) {
    return 'Not Set';
  }

  return formatHumanReadable(status);
}
