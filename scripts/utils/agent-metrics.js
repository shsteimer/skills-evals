function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getFromAliases(obj, aliases) {
  for (const alias of aliases) {
    if (Object.hasOwn(obj, alias)) {
      const value = coerceNumber(obj[alias]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function findUsageEntries(value, entries, seen) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      findUsageEntries(item, entries, seen);
    }
    return;
  }

  const inputTokens = getFromAliases(value, ['input_tokens', 'prompt_tokens', 'inputTokens', 'promptTokens']);
  const outputTokens = getFromAliases(value, ['output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens']);
  const totalTokens = getFromAliases(value, ['total_tokens', 'totalTokens']);
  const costUsd = getFromAliases(value, ['cost_usd', 'costUsd', 'total_cost_usd']);

  const hasUsageSignal = inputTokens !== null || outputTokens !== null || totalTokens !== null || costUsd !== null;
  if (hasUsageSignal) {
    const signature = JSON.stringify({ inputTokens, outputTokens, totalTokens, costUsd });
    if (!seen.has(signature)) {
      entries.push({
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
        costUsd: costUsd ?? 0
      });
      seen.add(signature);
    }
  }

  for (const nested of Object.values(value)) {
    findUsageEntries(nested, entries, seen);
  }
}

function safeParseJsonLines(output) {
  if (!output || output.trim() === '') {
    return [];
  }

  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const parsed = [];

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Not all agent output lines are guaranteed to be valid JSON.
    }
  }

  return parsed;
}

export function extractAgentMetricsFromOutput(output) {
  const parsedLines = safeParseJsonLines(output);
  const usageEntries = [];
  const seen = new Set();

  for (const line of parsedLines) {
    findUsageEntries(line, usageEntries, seen);
  }

  const tokenUsage = usageEntries.reduce(
    (acc, entry) => {
      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.totalTokens += entry.totalTokens;
      acc.costUsd += entry.costUsd;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 }
  );

  return {
    parsedLines: parsedLines.length,
    usageEvents: usageEntries.length,
    tokenUsage
  };
}
