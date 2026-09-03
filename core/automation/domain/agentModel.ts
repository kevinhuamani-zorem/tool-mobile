export interface AgentModelUsage {
    requestedModel: string;
    actualModels: string[];
}

export function normalizeAgentModel(value?: string): string {
    if (value !== undefined && typeof value !== 'string') throw new Error('Modelo de Copilot inválido.');
    const model = value?.trim() || 'auto';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)) {
        throw new Error('Modelo de Copilot inválido. Usa el identificador mostrado por /model.');
    }
    return model;
}

/** Only model metadata from documented/observed CLI events; never assistant prose. */
export function modelFromCopilotEvent(event: any): string | null {
    const value = event?.type === 'session.auto_mode_resolved'
        ? event.data?.chosenModel
        : ['assistant.message', 'tool.execution_start'].includes(event?.type)
            ? event.data?.model : null;
    // model.model_call_started may refer to auxiliary routing models, not the agent.
    if (typeof value !== 'string' || !value.trim() || value === 'auto') return null;
    try { return normalizeAgentModel(value); } catch { return null; }
}
