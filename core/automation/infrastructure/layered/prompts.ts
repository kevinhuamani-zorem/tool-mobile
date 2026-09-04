/**
 * Prompts de Lorem, Zorem y Sumrak, perfiles custom-agent y el contrato de salida de cada autor.
 */
import fs from 'fs';
import path from 'path';
import {
    GenerationPlan,
} from '../../contracts';
import {
    GenerationAgentRole,
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    validateLayeredAgentResult,
} from '../../domain/layeredGenerationContracts';
import {
    AuthorRole,
} from './roles';

export function partialPrompt(role: AuthorRole, outputFile: string, repair = false): string {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const ownership = role === 'behavior-author'
        ? [
            'Genera únicamente Feature y Steps.',
            'Usa deterministic-draft.json como punto de partida rápido, no como restricción: mejora su Gherkin y reutilización cuando el plan lo autorice.',
            'El Gherkin debe ser declarativo, conservar tags y formato del framework y cada acción grabada debe quedar trazada.',
            'Si el Feature o los Steps tienen operation update, parte del archivo de baselines/ y solo añade tu Scenario o tus definiciones: los Scenarios y definiciones existentes se conservan byte a byte.',
            'En el archivo Feature puedes usar And/But; en TypeScript importa e invoca únicamente Given, When y Then porque Cucumber no exporta And/But como funciones.',
            'Steps solo puede invocar métodos del Screen Object: prohíbe XPath, UiSelector, accessibility id y selectores literales.',
            'Declara en actionTrace el screenMethod requerido para que Zorem implemente exactamente esa interfaz.',
            'Conserva los screenMethod y locatorName de deterministic-draft.json: Zorem ya trabaja sobre esa interfaz en paralelo; cámbiala solo si el plan lo exige.',
            'Evalúa el diseño funcional como pass o suggestion; una sugerencia nunca bloquea la generación.',
        ].join(' ')
        : [
            'Genera únicamente Screen Object y Locators.',
            'Usa deterministic-draft.json como referencia de forma y trazabilidad, no como autoridad sobre reuse; el plan y los candidatos autorizados mandan. Un archivo del borrador con operation update trae solo sus adiciones (getters, métodos, claves) sobre el baseline de baselines/.',
            'Lee behavior-result.json y lorem-handoff.json: implementa exactamente los screenMethod requeridos por Lorem.',
            'Para operation update parte de baselines y preserva byte a byte toda API, import y locator no afectado.',
            'La operación y decisión del plan mandan: si indica create, crea la key y getter homónimos con el primary exacto aunque exista un elemento semánticamente parecido; reutiliza solo cuando el plan lo autorice.',
            'No construyas locators dentro de métodos de acción: cada screenMethod debe consumir un único getter y ningún selector literal.',
            'Conserva exactamente el nombre de clase, singleton exportado, APIs e imports del baseline salvo el cambio explícitamente requerido.',
            'Reutiliza solo candidatos autorizados. No inventes selectores ni copies selectores Android al bloque iOS.',
            'Cada getter debe usar el TypeLocator y valor primary de la plataforma grabada; la otra plataforma conserva su valor existente o una clave vacía.',
            'Usa aliases del framework y nunca imports relativos.',
        ].join(' ');
    return [
        `Eres ${identity.name}, responsable de ${role} bajo la coordinación de Derek.`,
        'Lee primero agent-memory.json: respeta su ownership y usa solo los archivos enumerados en input-manifest.json.',
        ...(repair ? ['Lee repair-feedback.json y corrige únicamente los errores asignados a tu capa.'] : []),
        ownership,
        `Escribe solo ${outputFile} y cumple result.schema.json.`,
        ...(repair ? [
            'Después de escribir el resultado, vuelve a leer repair-feedback.json: Derek puede actualizarlo con status correction-required.',
            'Si aparecen errores nuevos, corrígelos y vuelve a escribir el mismo resultado; termina solo cuando el status sea accepted.',
        ] : []),
        'No explores el framework ni escribas fuera de esta carpeta.',
    ].join(' ');
}

export function integrationPrompt(repair = false): string {
    return [
        'Eres Sumrak, integration-reviewer bajo la coordinación de Derek.',
        'Lee primero agent-memory.json y luego behavior-result.json, interaction-result.json y sus handoffs.',
        ...(repair ? ['Lee integration-feedback.json y corrige la integración solicitada.'] : []),
        'Integra ambos resultados sin cambiar recordingId, planId, rutas ni el contenido de los cuatro archivos.',
        'Copia byte por byte files[].content desde los resultados de los autores; el recorder los impondrá como fuente de verdad.',
        'Incluye exactamente una resolución por cada gap de generation-plan.json.unresolvedGapIds; no omitas ni inventes gapId.',
        'Las resoluciones deterministas por secuencia del plan son autoridad: no cambies create a reuse por similitud de nombre.',
        'Reuse exige coincidencia simultánea de TypeLocator y selector normalizado, además de selectedCandidate autorizado.',
        'Copia actionTrace desde behavior-result.json; no inventes otros screenMethod ni locatorName.',
        'Comprueba trazabilidad cruzada entre Gherkin, Steps, Screen Object y Locators.',
        'Escribe solo agent-response.json cumpliendo agent-response.schema.json.',
        'Esta es la salida visible que el QA podrá revisar y corregir.',
    ].join(' ');
}

export function authorContractErrors(
    result: unknown,
    role: AuthorRole,
    plan: GenerationPlan,
): string[] {
    const errors = validateLayeredAgentResult(result, role, plan.recordingId, plan.planId);
    if (errors.length) return errors;
    const typed = result as LayeredAgentResult;
    const expectedLayers = role === 'behavior-author'
        ? new Set(['feature', 'steps'])
        : new Set(['screen', 'locators']);
    const expectedPaths = new Map(
        plan.files
            .filter(file => expectedLayers.has(file.layer))
            .map(file => [file.layer, file.path]),
    );
    const actualPaths = new Map(typed.files.map(file => [file.layer, file.path]));
    for (const [layer, expectedPath] of expectedPaths) {
        if (actualPaths.get(layer) !== expectedPath) {
            errors.push(`${role} debe conservar la ruta ${expectedPath} para ${layer}.`);
        }
    }
    if (actualPaths.size !== expectedPaths.size) {
        errors.push(`${role} debe producir exactamente sus ${expectedPaths.size} capas del plan.`);
    }
    return errors;
}

export function writeAgentProfile(
    stageDirectory: string,
    role: GenerationAgentRole,
    prompt: string,
): void {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const agentsDirectory = path.join(stageDirectory, '.github', 'agents');
    fs.mkdirSync(agentsDirectory, { recursive: true });
    const profile = [
        '---',
        `name: ${identity.name}`,
        `description: ${role} de Appium Recorder; trabaja solo en su paquete aislado.`,
        'tools: [read, edit, search, execute]',
        'disable-model-invocation: true',
        'user-invocable: true',
        '---',
        '',
        prompt,
        '',
        'No delegues en otros agentes. No escribas fuera del directorio actual.',
        '',
    ].join('\n');
    fs.writeFileSync(
        path.join(agentsDirectory, `${identity.name}.agent.md`),
        profile,
        'utf8',
    );
}
