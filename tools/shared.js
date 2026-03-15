/**
 * Shared utilities for viewer tools.
 * All viewers load data via ?data= URL param pointing to a JS file
 * that sets global variables.
 */

/** HTML-escape a string for safe insertion. */
export function esc(s) {
  const el = document.createElement('span');
  el.textContent = String(s ?? '');
  return el.innerHTML;
}

/** Get the ?data= param from the URL. */
export function getDataPath() {
  return new URLSearchParams(location.search).get('data');
}

/**
 * Load a data JS file via script tag injection.
 * Paths without a leading / are treated as relative to the server root.
 * Returns a promise that resolves when the script loads.
 */
export function loadData(dataPath) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = dataPath.startsWith('/') ? dataPath : `/${dataPath}`;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${dataPath}`));
    document.head.appendChild(s);
  });
}

/**
 * Build a link to a sibling viewer tool.
 * Uses absolute paths to avoid relative path resolution issues.
 *
 * @param {string} viewer - viewer folder name (e.g. 'diff-viewer')
 * @param {string} dataFile - data file name in the result folder (e.g. 'diff-data.js')
 * @param {string} dataPath - current data path from URL param
 * @returns {string} URL to the sibling viewer
 */
export function viewerLink(viewer, dataFile, dataPath) {
  return `/tools/${viewer}/index.html?data=${dataDir(dataPath)}${dataFile}`;
}

/**
 * Get the directory portion of a data path (strip filename, normalize leading slash).
 * Useful for resolving relative asset paths (e.g. screenshots) against the data folder.
 */
export function dataDir(dataPath) {
  return dataPath.replace(/^\//, '').replace(/[^/]*$/, '');
}
