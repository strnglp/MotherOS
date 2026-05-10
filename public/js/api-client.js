const BASE = "/api/terminals";

export async function listTerminals() {
  const res = await fetch(BASE);
  return res.json();
}

export async function getTerminal(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`Terminal ${id} not found`);
  return res.json();
}

export async function createTerminal(terminal) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(terminal),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function updateTerminal(id, terminal) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(terminal),
  });
  return res.json();
}

export async function deleteTerminal(id) {
  await fetch(`${BASE}/${id}`, { method: "DELETE" });
}

export async function uploadAsset(terminalId, file) {
  const reader = new FileReader();
  const data = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${BASE}/${terminalId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, data }),
  });
  return res.json();
}

export async function listAssets(terminalId) {
  const res = await fetch(`${BASE}/${terminalId}/assets`);
  return res.json();
}

export async function deleteAsset(terminalId, filename) {
  await fetch(`${BASE}/${terminalId}/assets/${filename}`, { method: "DELETE" });
}
