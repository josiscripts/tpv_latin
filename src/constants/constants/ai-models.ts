// Modelos de Claude disponibles para procesamiento de documentos
// Verificados contra documentación oficial de Anthropic (octubre 2026)

export interface AIModel {
  id: string;
  name: string;
  description: string;
  inputCostPerMillion: number; // EUR
  outputCostPerMillion: number; // EUR
  maxOutputTokens: number;
  recommendedFor: string;
}

export const AI_MODELS: Record<string, AIModel> = {
  'claude-haiku-5-5': {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    description: 'Modelo económico y rápido. Ideal para documentos estándar, facturas simples y albaranes.',
    inputCostPerMillion: 0.80,
    outputCostPerMillion: 4,
    maxOutputTokens: 4096,
    recommendedFor: 'Uso habitual, documentos estándar',
  },
  'claude-sonnet-5-5': {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    description: 'Modelo equilibrado con mejor razonamiento. Mejor para documentos complejos, múltiples idiomas o extracciones precisas.',
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    maxOutputTokens: 4096,
    recommendedFor: 'Documentos complejos, precisión',
  },
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    description: 'Modelo más potente. Para casos extremadamente complejos, análisis exhaustivos y máxima precisión.',
    inputCostPerMillion: 15,
    outputCostPerMillion: 60,
    maxOutputTokens: 4096,
    recommendedFor: 'Máxima precisión, casos complejos',
  },
};

export const DEFAULT_AI_MODEL = 'claude-haiku-5-5' as const;

export const ALLOWED_AI_MODELS = Object.keys(AI_MODELS) as Array<keyof typeof AI_MODELS>;

export function getAIModel(modelId: string): AIModel | null {
  return AI_MODELS[modelId as keyof typeof AI_MODELS] || null;
}

export function isValidAIModel(modelId: string): boolean {
  return modelId in AI_MODELS;
}

export function estimateCost(
  modelId: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number | null {
  const model = getAIModel(modelId);
  if (!model) return null;

  const inputCost = (estimatedInputTokens / 1_000_000) * model.inputCostPerMillion;
  const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputCostPerMillion;

  return inputCost + outputCost;
}
