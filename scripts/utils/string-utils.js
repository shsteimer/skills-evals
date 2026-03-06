import { createHash } from 'crypto';

export function computeTaskHash(prompt, criteria, taskJson) {
  const hash = createHash('sha256');
  hash.update(prompt);
  hash.update(criteria);
  hash.update(taskJson);
  return hash.digest('hex').slice(0, 12);
}

export function sanitizeName(name) {
  // Replace spaces with hyphens and remove special characters
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function getCurrentTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}




