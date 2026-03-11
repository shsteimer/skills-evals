import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
const projectRoot = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

// Load safehouse config from config/safehouse/config.json
let safehouseFileConfig = {};
try {
  const raw = readFileSync(path.join(projectRoot, 'config', 'safehouse', 'config.json'), 'utf-8');
  safehouseFileConfig = JSON.parse(raw);
} catch {
  // No config file — use defaults
}

/**
 * Get environment variable with optional default value
 * @param {string} key - Environment variable name
 * @param {string} [defaultValue] - Default value if not set
 * @returns {string|undefined}
 */
export function getEnv(key, defaultValue = undefined) {
  return process.env[key] || defaultValue;
}

/**
 * Get required environment variable, throws if not set
 * @param {string} key - Environment variable name
 * @returns {string}
 * @throws {Error} If environment variable is not set
 */
export function getRequiredEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is not set`);
  }
  return value;
}

/**
 * Get agent-specific configuration
 * @param {string} agentName - Name of the agent (e.g., 'claude', 'cursor', 'codex')
 * @returns {Object} Configuration object
 */
export function getAgentConfig(agentName) {
  const upperName = agentName.toUpperCase();
  
  return {
    model: getEnv(`${upperName}_MODEL`),
    additionalArgs: getEnv(`${upperName}_ADDITIONAL_ARGS`, ''),
  };
}

/**
 * Get evaluation configuration
 * @returns {Object} Evaluation configuration
 */
export function getEvalConfig() {
  return {
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
    model: getEnv('EVAL_MODEL', 'gpt-5-mini')
  };
}

/**
 * Get safehouse configuration
 * @returns {Object} Safehouse configuration
 */
export function getSafehouseConfig() {
  return {
    bin: getEnv('SAFEHOUSE_BIN', safehouseFileConfig.bin || 'safehouse'),
    enableFeatures: getEnv('SAFEHOUSE_ENABLE', safehouseFileConfig.enableFeatures || ''),
  };
}

/**
 * Get bot auth configuration for workspace isolation
 * @returns {Object} Bot auth config (token may be undefined if not configured)
 */
export function getBotAuthConfig() {
  return {
    ghToken: getEnv('EVAL_GH_TOKEN'),
    gitName: getEnv('EVAL_GIT_NAME', 'skills-evals-bot'),
    gitEmail: getEnv('EVAL_GIT_EMAIL', 'skills-evals-bot@users.noreply.github.com'),
  };
}

/**
 * Parse additional arguments string into array
 * @param {string} argsString - Space-separated arguments
 * @returns {Array<string>} Array of arguments
 */
export function parseAdditionalArgs(argsString) {
  if (!argsString || argsString.trim() === '') {
    return [];
  }
  
  // Simple space-based parsing
  // For more complex parsing (quoted strings, etc.), could enhance this
  return argsString.trim().split(/\s+/);
}



