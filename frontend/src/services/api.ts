export async function parseText(text: string) {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return response.json();
}
