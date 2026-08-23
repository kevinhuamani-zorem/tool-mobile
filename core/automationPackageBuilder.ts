import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AutomationPackageResult,
    AutomationScenario,
    GenerationPlan,
    UnresolvedGap,
} from './automationContracts';
import { AutomationMemory } from './automationMemory';
import { AutomationResponseValidator } from './automationResponseValidator';
import { DeterministicResolver, ResolverResult } from './deterministicResolver';
import { FwkMobileGenerator, GeneratedPreview } from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';
import { withGeneratedResponseMetadata } from './generatedFileMetadata';

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function relative(file: string): string {
    return path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
}

function baselineSymbols(layer: AgentGeneratedFile['layer'], content: string): string[] {
    if (layer === 'steps') {
        return [...content.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)]
            .map(match => match[1]);
    }
    if (layer === 'screen') {
        return [...content.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)]
            .map(match => match[1]);
    }
    if (layer === 'locators') {
        try {
            const document = JSON.parse(content) as Record<string, unknown>;
            return Object.entries(document).flatMap(([block, value]) =>
                block !== '_metadata' && value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.keys(value as Record<string, unknown>).map(name => `${block}.${name}`)
                    : []
            );
        } catch {
            return [];
        }
    }
    return [];
}

function responseFromPreview(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview
): AutomationAgentResponse {
    const files: AgentGeneratedFile[] = [{
        layer: 'feature', path: relative(preview.featurePath), content: preview.featureContent,
    }];
    if (preview.stepPath && preview.stepContent) files.push({ layer: 'steps', path: relative(preview.stepPath), content: preview.stepContent });
    if (preview.screenPath && preview.screenContent) files.push({ layer: 'screen', path: relative(preview.screenPath), content: preview.screenContent });
    if (preview.locatorPath && preview.locatorContent) files.push({ layer: 'locators', path: relative(preview.locatorPath), content: preview.locatorContent });
    return {
        schemaVersion: 1,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: scenario.request.scenarioRows?.slice(1).flatMap(row =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [],
        files,
        assumptions: ['Salida producida completamente por el resolver determinista.'],
    };
}

function responseFromExistingFiles(
    scenario: AutomationScenario,
    plan: GenerationPlan
): AutomationAgentResponse {
    const files = plan.files.map(file => ({
        layer: file.layer,
        path: file.path,
        content: fs.readFileSync(path.join(projectPaths.frameworkRoot, file.path), 'utf-8'),
    }));
    return {
        schemaVersion: 1,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: scenario.request.scenarioRows?.flatMap(row =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [],
        files,
        assumptions: [
            `Caso equivalente reutilizado: ${plan.existingCase?.feature} / ${plan.existingCase?.scenario}.`,
            'Los cuatro archivos existentes se conservaron sin regeneración.',
        ],
    };
}

function responseSchema(): object {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['schemaVersion', 'recordingId', 'planId', 'resolutions', 'actionTrace', 'files'],
        properties: {
            schemaVersion: { const: 1 },
            recordingId: { type: 'string' },
            planId: { type: 'string' },
            resolutions: { type: 'array', items: { type: 'object', required: ['gapId', 'decision'] } },
            actionTrace: { type: 'array', items: { type: 'object', required: ['sequence', 'gherkinStep'] } },
            files: { type: 'array', minItems: 4, maxItems: 4 },
            assumptions: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
    };
}

function instructions(result: ResolverResult): string {
    return `# Contrato del agente de automatización\n\n` +
        `Objetivo: resolver únicamente los gaps de \`unresolved-context.json\` y escribir \`agent-response.json\`.\n\n` +
        `Reglas:\n` +
        `- Lee solo: generation-plan.json, reuse-context.json, collision-report.json, unresolved-context.json y scenario.json.\n` +
        `- No explores el repositorio ni leas XML/capturas salvo que un gap lo pida explícitamente.\n` +
        `- Conserva exactamente recordingId, planId y las cuatro rutas del plan.\n` +
        `- Los selectores verificados y las decisiones reuse/create del plan son definitivos. Los nombres logicos NO: si existe el gap gap-english-naming, renombralos a ingles conservando selector y decision.\n` +
        `- contextHint/elementIntent es solo una pista libre escrita por el QA para comprender el elemento. No la copies literalmente ni la conviertas uno-a-uno en un Step; sintetiza comportamientos declarativos usando el objetivo, criterio de aceptación y secuencia completa.\n` +
        `- No dupliques ninguna expresión o selector listado en collision-report.json; reutiliza su ruta y nombre lógico.\n` +
        `- Si reuse-context.json identifica un caso equivalente, conserva sus cuatro rutas y contenido.\n` +
        `- Si reuse-context.json contiene updateBaselines, abre únicamente su archivo reference dentro de baselines/, parte de ese contenido y añade solo lo faltante; no reemplaces ni borres APIs existentes.\n` +
        `- Steps solo orquestan; Screen Object extiende BaseScreen; un nombre lógico sirve para Android/iOS.\n` +
        `- El alias importado del Screen Object debe derivarse de su archivo (ej.: movements.screen.ts → movementsScreen); nunca uses generatedScreen, screen, page, screenObject u obj.\n` +
        `- Usa aliases del framework: @screenobjects para Screen Objects/BaseScreen, @utils para helpers y @locators para JSON. No uses rutas relativas en Steps ni Screen Objects.\n` +
        `- Importa browser desde @wdio/globals únicamente si el Screen Object contiene una llamada browser.; no dejes imports sin uso.\n` +
        `- Incluye trazabilidad para las ${result.scenario.actions.length} acciones en orden.\n` +
        `- El Feature debe tener @tag, @${result.scenario.platform}, [TC-N][Happy|Unhappy Path][AUTO-FRONT] y un Then real.\n` +
        `- Las filas de scenarioRows con status "reused" se copian LITERALES, caracter por caracter (tildes incluidas). Ya existen como step definition en el framework: si las reescribes o reemplazas su parametro por un literal, Cucumber las reporta como undefined al ejecutar. Ejemplo: \`Given el usuario <username> inicia sesión en Yape\` se copia tal cual, nunca con el nombre del usuario dentro.\n` +
        `- Todo <parametro> que dejes en un step obliga a \`Scenario Outline:\` y a una tabla \`Examples:\` con esa columna. Toma los valores de request.examples de scenario.json; si falta la columna, el parametro llega literal al step y no enlaza.\n` +
        `- Todo el codigo va en INGLES: metodos y getters del Screen Object, claves de locator, variables y parametros. El espanol se reserva para la prosa que lee el QA: la linea Feature, el nombre del Scenario y el texto de los steps. Ejemplo: el step "el usuario consulta todos sus movimientos" se resuelve con \`movementsScreen.openAllMovements()\`, nunca con \`elUsuarioConsultaTodosSusMovimientos()\`.\n` +
        `- Redacta Gherkin declarativo: describe intención, capacidad y resultado de negocio; no narres clicks, botones, campos, scrolls, swipes ni esperas.\n` +
        `- Agrupa acciones técnicas consecutivas dentro de un único step funcional. Varias secuencias pueden apuntar al mismo gherkinStep en actionTrace.\n` +
        `- Finaliza en menos de 5 minutos. No escribas fuera de esta carpeta.\n` +
        `- Ejecuta \`node verify-package.js\`. Si falla, realiza una sola reparación dirigida.\n`;
}

function regenerationInstructions(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    refinement: string
): string {
    return `# Refinamiento de una automatización existente\n\n` +
        `Objetivo: mejorar el caso ya generado usando \`baseline-response.json\` y escribir una nueva versión completa en \`agent-response.json\`.\n\n` +
        `Solicitud del QA: ${refinement}\n\n` +
        `Reglas:\n` +
        `- Lee solo: baseline-response.json, generation-plan.json, scenario.json, reuse-context.json, collision-report.json y unresolved-context.json.\n` +
        `- Conserva exactamente recordingId=${scenario.recordingId}, planId=${plan.planId} y las cuatro rutas del plan.\n` +
        `- Parte del contenido de baseline-response.json; modifica únicamente lo necesario para el refinamiento.\n` +
        `- Usa un alias de dominio derivado del archivo Screen Object; están prohibidos generatedScreen, screen, page, screenObject y obj.\n` +
        `- Conserva imports por alias (@screenobjects, @utils, @locators), nunca rutas relativas. browser solo se importa cuando se utiliza.\n` +
        `- No explores el repositorio ni cambies selectores verificados o decisiones deterministas.\n` +
        `- contextHint/elementIntent es contexto no vinculante del QA: no lo copies literalmente como Step; conserva o mejora la síntesis declarativa del comportamiento completo.\n` +
        `- Redacta Gherkin declarativo y agrupa clicks, scrolls, swipes y esperas dentro de steps funcionales.\n` +
        `- Conserva los tags de plataforma: @android si Android está completo y @ios si iOS está completo.\n` +
        `- Conserva literales las filas reused (login incluido) y su tabla Examples: son steps que ya existen en el framework.\n` +
        `- Los identificadores nuevos van en ingles (metodos, getters, locators, variables); no renombres los que ya existen en el baseline.\n` +
        `- Conserva una entrada actionTrace para cada secuencia; varias secuencias pueden compartir gherkinStep.\n` +
        `- Incluye una resolución para gap-regeneration-refinement y entrega exactamente las cuatro capas.\n` +
        `- No escribas fuera de esta carpeta. Ejecuta \`node verify-package.js\` y realiza como máximo una reparación dirigida.\n`;
}

function verifierSource(): string {
    return String.raw`'use strict';
const plan=require('./generation-plan.json');
const scenario=require('./scenario.json');
const fs=require('fs');
const reuse=require('./reuse-context.json');
let response;
try{response=require('./agent-response.json')}catch(e){console.error('Falta agent-response.json');process.exit(1)}
const errors=[];
if(response.recordingId!==scenario.recordingId)errors.push('recordingId no coincide');
if(response.planId!==plan.planId)errors.push('planId no coincide');
for(const f of plan.files){const got=(response.files||[]).find(x=>x.layer===f.layer);if(!got)errors.push('Falta '+f.layer);else if(got.path!==f.path)errors.push('Ruta inválida '+got.path)}
for(const id of plan.unresolvedGapIds){if(!(response.resolutions||[]).some(x=>x.gapId===id))errors.push('Gap no resuelto '+id)}
for(const a of scenario.actions){if(!(response.actionTrace||[]).some(x=>x.sequence===a.sequence))errors.push('Acción sin traza '+a.sequence)}
const feature=(response.files||[]).find(x=>x.layer==='feature')?.content||'';
const steps=(response.files||[]).find(x=>x.layer==='steps')?.content||'';
const screen=(response.files||[]).find(x=>x.layer==='screen')?.content||'';
const locator=(response.files||[]).find(x=>x.layer==='locators')?.content||'';
for(const baseline of reuse.updateBaselines||[]){const proposed=(response.files||[]).find(x=>x.layer===baseline.layer)?.content||'';const content=fs.readFileSync(baseline.reference,'utf8');let tokens=[];if(baseline.layer==='steps')tokens=[...content.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(x=>x[1]);else if(baseline.layer==='screen')tokens=[...content.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]);else if(baseline.layer==='locators'){try{tokens=Object.entries(JSON.parse(content)).filter(([name,value])=>name!=='_metadata'&&value&&typeof value==='object'&&!Array.isArray(value)).flatMap(([,value])=>Object.keys(value))}catch(e){}}const missing=tokens.filter(token=>!proposed.includes(token));if(missing.length)errors.push('Update destructivo '+baseline.path+': '+missing.slice(0,5).join(', '))}
if(!/^\s*@[-A-Za-z0-9_]+/m.test(feature))errors.push('Feature sin tag válido');
const requiredPlatforms=new Set([scenario.platform]);
try{const document=JSON.parse(locator);for(const platform of ['android','ios']){const values=Object.entries(document).filter(([name,value])=>name.toLowerCase().endsWith(platform)&&value&&typeof value==='object'&&!Array.isArray(value)).flatMap(([,value])=>Object.values(value));if(values.length&&values.every(value=>typeof value==='string'&&value.trim()))requiredPlatforms.add(platform)}}catch(e){}
for(const platform of requiredPlatforms){if(!new RegExp('^\\s*@[^\\n]*@'+platform+'(?:\\s|$)','mi').test(feature))errors.push('Falta tag @'+platform)}
if(!/Scenario(?: Outline)?: \[TC-\d+\]\[(?:Happy|Unhappy) Path\]\[AUTO-FRONT\]/.test(feature))errors.push('Formato Scenario inválido');
if(!/^\s*Then\s+\S+/m.test(feature))errors.push('Scenario sin Then');
const normStep=v=>String(v||'').replace(/\s+/g,' ').trim();
const featureLines=[...feature.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)].map(x=>x[1].trim());
const presentSteps=new Set(featureLines.map(normStep));
for(const row of (scenario.request&&scenario.request.scenarioRows)||[]){if(row.status!=='reused')continue;if(!presentSteps.has(normStep(row.text)))errors.push('Step reutilizado reescrito: "'+row.text+'". Copialo literal: lo resuelve un step definition que ya existe')}
const params=[...new Set(featureLines.flatMap(x=>[...x.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(y=>y[1])))];
if(params.length){if(!/^\s*Scenario\s+Outline\s*:/mi.test(feature))errors.push('El Feature usa <'+params.join('>, <')+'> pero declara "Scenario:": debe ser "Scenario Outline:" con su tabla Examples');const cols=new Set();const flines=feature.split(/\r?\n/);for(let i=0;i<flines.length;i++){if(!/^\s*Examples\s*:/i.test(flines[i]))continue;const head=flines.slice(i+1).find(x=>x.trim().startsWith('|'));if(!head)continue;head.split('|').slice(1,-1).map(x=>x.trim()).filter(Boolean).forEach(x=>cols.add(x))}const missingCols=params.filter(x=>!cols.has(x));if(missingCols.length)errors.push('Faltan columnas en Examples para: <'+missingCols.join('>, <')+'>')}
const imperative=/^\s*(?:Given|When|Then|And|But)\s+.*(?:\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b|\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:bot[oó]n|elemento|campo)\b|\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b|\b(?:espera|esperar)\s+\d+\s*segundos?\b|\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b)/gmi;
for(const match of feature.matchAll(imperative))errors.push('Gherkin técnico/imperativo: '+match[0].trim());
const normalizeText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]+>/g,'<param>').replace(/[^a-z0-9<>]+/g,' ').replace(/\s+/g,' ').trim();
const featureSteps=[...feature.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)].map(match=>normalizeText(match[1]));
for(const action of scenario.actions){const hint=normalizeText(action.contextHint||action.elementIntent||action.description);if(hint&&featureSteps.includes(hint))errors.push('Pista contextual copiada literalmente como Step en acción '+action.sequence)}
const traceBySequence=new Map((response.actionTrace||[]).map(x=>[x.sequence,x.gherkinStep]));
const technical=new Set(['SCROLL_DOWN','SCROLL_UP','SWIPE','ESPERAR','SCREENSHOT']);
for(const action of scenario.actions.filter(x=>technical.has(x.action))){const current=traceBySequence.get(action.sequence);const grouped=current&&[action.sequence-1,action.sequence+1].some(x=>traceBySequence.get(x)===current);if(!grouped)errors.push('Acción técnica sin agrupar '+action.sequence+' ('+action.action+')')}
const defs=[...steps.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(x=>x[1]);
const esFn=new Set(['el','la','los','las','un','una','unos','unas','del','al','de','por','para','con','se','su','sus','lo','que','cual','cuando','donde','como','ver','este','esta','estos','estas','ese','esa','esos','esas']);
const esDom=new Set(['usuario','usuarios','boton','botones','pantalla','pantallas','mostrar','muestra','muestran','todo','todos','todas','mas','filtrar','filtro','filtros','buscar','busca','validar','valida','verificar','verifica','ingresar','ingresa','seleccionar','selecciona','escribir','escribe','contenedor','pagina','cuenta','cuentas','saldo','monto','correo','clave','contrasena','numero','nombre','fecha','campo','campos','lista','listas','mensaje','mensajes','guardar','enviar','cerrar','abrir','continuar','aceptar','cancelar','siguiente','anterior','inicio','periodo','periodos','fallo','fallos','fila','filas','movimiento','movimientos','titulo','opcion','opciones','esperado','esperados','esperada','esperadas','deberia','debe','consulta','consultar']);
const esTokens=name=>{const t=[...new Set(String(name||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>1))];const d=t.filter(w=>esDom.has(w));const f=t.filter(w=>esFn.has(w));return(!d.length&&f.length<2)?[]:[...d,...f]};
const declared=[];
for(const m of screen.matchAll(/public\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['metodo',m[1]]);
for(const m of screen.matchAll(/(?:private|protected|public)\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['getter',m[1]]);
for(const m of screen.matchAll(/(?:private|protected)\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['miembro',m[1]]);
for(const body of [steps,screen]){for(const m of body.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=:]/g))declared.push(['variable',m[1]]);for(const m of body.matchAll(/\bfor\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/g))declared.push(['variable',m[1]])}
try{const doc=JSON.parse(locator);for(const [block,value] of Object.entries(doc)){if(block==='_metadata'||!value||typeof value!=='object'||Array.isArray(value))continue;for(const key of Object.keys(value))declared.push(['locator',key])}}catch(e){}
const inheritedNames=new Set();
for(const baseline of reuse.updateBaselines||[]){let content='';try{content=fs.readFileSync(baseline.reference,'utf8')}catch(e){continue}
for(const m of content.matchAll(/(?:public|private|protected)\s+(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*\(/g))inheritedNames.add(m[1]);
if(baseline.layer==='locators'){try{const doc=JSON.parse(content);for(const [block,value] of Object.entries(doc)){if(block==='_metadata'||!value||typeof value!=='object'||Array.isArray(value))continue;for(const key of Object.keys(value))inheritedNames.add(key)}}catch(e){}}}
const reportedEs=new Set();
for(const [kind,name] of declared){if(inheritedNames.has(name)||reportedEs.has(name))continue;const markers=esTokens(name);if(!markers.length)continue;reportedEs.add(name);errors.push('Identificador en espanol ('+kind+'): '+name+' ['+markers.join(', ')+']. El codigo va en ingles; el espanol solo en el Gherkin')}
if(defs.some((x,i)=>defs.indexOf(x)!==i))errors.push('Definición Gherkin duplicada');
const methods=[...screen.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]);
if(methods.some((x,i)=>methods.indexOf(x)!==i))errors.push('Método Screen Object duplicado');
const screenPath=(plan.files||[]).find(x=>x.layer==='screen')?.path||'';
const screenBase=screenPath.split('/').pop().replace(/\.screen\.(?:ts|js)$/i,'');
const screenClass=screenBase.split(/[^A-Za-z0-9]+/).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1)).join('')+'Screen';
const screenAlias=screenClass[0].toLowerCase()+screenClass.slice(1);
const imported=steps.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+\.screen\.(?:ts|js)['"]/m)?.[1];
if(imported!==screenAlias)errors.push('Alias Screen Object inválido: '+(imported||'ausente')+'. Esperado: '+screenAlias);
if(!new RegExp('class\\s+'+screenClass+'\\s+extends\\s+BaseScreen\\b').test(screen))errors.push('Clase Screen Object inválida: esperado '+screenClass);
if(!new RegExp('export\\s+default\\s+new\\s+'+screenClass+'\\s*\\(').test(screen))errors.push('Singleton Screen Object inválido: esperado '+screenClass);
if(/Locators\.[A-Za-z_$][\w$]*-/.test(screen))errors.push('Acceso inválido a bloque locator con guiones');
const importSources=content=>[...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map(x=>x[1]);
for(const [label,content] of [['Steps',steps],['ScreenObject',screen]]){const relative=importSources(content).filter(source=>source.startsWith('.'));if(relative.length)errors.push(label+' usa imports relativos: '+relative.join(', '))}
const importsBrowser=/import\s*\{[^}]*\bbrowser\b[^}]*\}\s*from\s*['"]@wdio\/globals['"]/.test(screen);
const usesBrowser=/\bbrowser\./.test(screen);
if(importsBrowser&&!usesBrowser)errors.push('ScreenObject importa browser pero no lo utiliza');
if(usesBrowser&&!importsBrowser)errors.push('ScreenObject utiliza browser sin importarlo desde @wdio/globals');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}console.log('PASS: contrato del paquete válido');
`;
}

/**
 * Copia del escenario para el paquete, sin la triplicación de acciones.
 *
 * `scenario.actions` ya describe cada acción completa; `request.scenarioRows`
 * las repetía enteras y `plan.resolutions` otra vez. En una grabación de 14
 * acciones eso eran ~3,8 KB de puro duplicado. Las filas solo necesitan
 * referenciar la secuencia. La copia del recording conserva todo: esta poda
 * aplica únicamente al paquete que lee el agente.
 */
function packagedScenario(scenario: AutomationScenario): AutomationScenario {
    const rows = scenario.request.scenarioRows;
    if (!rows?.length) return scenario;
    return {
        ...scenario,
        request: {
            ...scenario.request,
            scenarioRows: rows.map(row => ({
                ...row,
                actions: (row.actions || []).map(action => ({ sequence: action.sequence } as any)),
            })),
        },
    };
}

/**
 * [visual-recorder] Se lanza cuando el resolver marca un gap `blocking`.
 * A diferencia del resto de gaps, este no viaja al agente: el paquete no llega
 * a escribirse y el QA tiene que corregir la grabacion primero.
 */
export class BlockingGapError extends Error {
    constructor(readonly gaps: UnresolvedGap[]) {
        super(gaps.map(gap => `${gap.description} ${gap.requiredOutput}`).join(' | '));
        this.name = 'BlockingGapError';
    }
}

export class AutomationPackageBuilder {
    constructor(
        private readonly resolver = new DeterministicResolver(),
        private readonly memory = new AutomationMemory(),
        private readonly generator = new FwkMobileGenerator(),
        private readonly validator = new AutomationResponseValidator(),
        private readonly frameworkRoot = projectPaths.frameworkRoot,
    ) {}

    prepareRecordedScenario(
        recordingDirectory: string,
        cleanPackage = false
    ): AutomationPackageResult {
        const scenarioFile = path.join(recordingDirectory, 'scenario.json');
        if (!fs.existsSync(scenarioFile)) {
            throw new Error('La grabación no contiene scenario.json');
        }
        const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8')) as AutomationScenario;
        if (!scenario.actions.length) throw new Error('La grabación no contiene acciones para reprocesar');
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        if (cleanPackage && fs.existsSync(packageDirectory)) {
            fs.rmSync(packageDirectory, { recursive: true, force: true });
        }
        return this.prepare(scenario, recordingDirectory);
    }

    prepareRegeneration(
        recordingDirectory: string,
        refinement: string
    ): AutomationPackageResult {
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        const read = <T>(name: string): T => JSON.parse(
            fs.readFileSync(path.join(packageDirectory, name), 'utf-8')
        ) as T;
        const normalizedRefinement = refinement.trim() ||
            'Realizar una revisión general del caso y mejorar claridad, mantenibilidad y consistencia sin cambiar su comportamiento.';
        if (!fs.existsSync(path.join(packageDirectory, 'agent-response.json'))) {
            throw new Error('La grabación no tiene una propuesta validada para regenerar');
        }
        const scenario = read<AutomationScenario>('scenario.json');
        const previousPlan = read<GenerationPlan>('generation-plan.json');
        const baseline = read<AutomationAgentResponse>('agent-response.json');
        const previousValidation = fs.existsSync(path.join(packageDirectory, 'validation.json'))
            ? read<any>('validation.json')
            : this.validator.validate(scenario, previousPlan, baseline);
        if (!previousValidation.valid || previousValidation.qualityScore !== 100) {
            throw new Error('Solo se puede regenerar una propuesta previamente validada al 100%');
        }
        if (previousPlan.files.length !== 4 || previousPlan.files.some(file =>
            !fs.existsSync(path.join(this.frameworkRoot, file.path))
        )) {
            throw new Error('Las cuatro capas todavía no fueron importadas en el workspace');
        }

        const statusFile = path.join(packageDirectory, 'status.json');
        const previousStatus = fs.existsSync(statusFile) ? read<any>('status.json') : {};
        const iteration = Number(previousStatus.regenerationIteration || 0) + 1;
        const plan: GenerationPlan = {
            ...previousPlan,
            planId: `plan-${crypto.randomUUID()}`,
            status: 'regeneration',
            files: previousPlan.files.map(file => ({ ...file, operation: 'update' })),
            unresolvedGapIds: ['gap-regeneration-refinement'],
        };
        const revisedScenario: AutomationScenario = {
            ...scenario,
            revision: scenario.revision + 1,
        };
        const unresolvedContext = {
            schemaVersion: revisedScenario.schemaVersion,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            gaps: [{
                id: 'gap-regeneration-refinement',
                type: 'refinement',
                description: normalizedRefinement,
                requiredOutput: 'Actualizar las cuatro capas conservando rutas, selectores verificados y trazabilidad.',
            }],
        };
        const instructions = regenerationInstructions(revisedScenario, plan, normalizedRefinement);
        const serializedContext = [baseline, revisedScenario, plan, unresolvedContext]
            .reduce((total, value) => total + Buffer.byteLength(
                `${JSON.stringify(value, null, 2)}\n`,
                'utf-8'
            ), Buffer.byteLength(instructions, 'utf-8'));
        const retainedContext = ['reuse-context.json', 'collision-report.json']
            .reduce((total, name) => {
                const file = path.join(packageDirectory, name);
                return total + (fs.existsSync(file) ? fs.statSync(file).size : 0);
            }, 0);
        const contextBytes = serializedContext + retainedContext;
        // El límite es un objetivo de coste, no una regla: el alcance del caso lo
        // decide el QA y una grabación larga necesita más contexto. Se informa el
        // sobrecosto y se continúa.
        const contextWarning = contextBytes > plan.budgets.maxContextBytes
            ? `El contexto del refinamiento es de ${contextBytes} bytes y supera el objetivo de ` +
              `${plan.budgets.maxContextBytes}. El agente costará más tokens.`
            : undefined;

        const historyDirectory = path.join(
            packageDirectory,
            'history',
            `regeneration-${String(iteration).padStart(3, '0')}`
        );
        if (fs.existsSync(historyDirectory)) {
            throw new Error(`La iteración de regeneración ${iteration} ya existe`);
        }
        fs.mkdirSync(historyDirectory, { recursive: true });
        for (const name of ['scenario.json', 'generation-plan.json', 'agent-response.json', 'validation.json', 'status.json']) {
            const source = path.join(packageDirectory, name);
            if (fs.existsSync(source)) fs.copyFileSync(source, path.join(historyDirectory, name));
        }

        writeJson(path.join(packageDirectory, 'scenario.json'), packagedScenario(revisedScenario));
        writeJson(path.join(packageDirectory, 'generation-plan.json'), plan);
        writeJson(path.join(packageDirectory, 'baseline-response.json'), baseline);
        writeJson(path.join(packageDirectory, 'unresolved-context.json'), unresolvedContext);
        writeJson(path.join(packageDirectory, 'agent-response.schema.json'), responseSchema());
        fs.writeFileSync(path.join(packageDirectory, 'instructions.md'), instructions);
        fs.writeFileSync(path.join(packageDirectory, 'verify-package.js'), verifierSource());
        for (const stale of ['agent-response.json', 'validation.json', 'repair-context.json']) {
            const file = path.join(packageDirectory, stale);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        writeJson(statusFile, {
            ...previousStatus,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            state: 'ready-for-agent',
            mode: 'regeneration',
            regenerationIteration: iteration,
            refinement: normalizedRefinement,
            preparedAt: new Date().toISOString(),
            budgets: plan.budgets,
        });
        return {
            packageDirectory,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            status: plan.status,
            deterministicCoverage: plan.deterministicCoverage,
            unresolvedGaps: 1,
            agentRequired: true,
            responseAvailable: false,
            contextBytes,
            contextWarning,
        };
    }

    prepare(scenario: AutomationScenario, recordingDirectory: string): AutomationPackageResult {
        const result = this.resolver.resolve(scenario);
        // [visual-recorder] Un gap bloqueante corta antes de crear el paquete:
        // si se escribiera, el agente arrancaria igual y gastaria tokens en un
        // caso que el verificador va a rechazar mas adelante de todos modos.
        const blocking = result.unresolvedContext.gaps.filter(gap => gap.blocking);
        if (blocking.length) throw new BlockingGapError(blocking);
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        fs.mkdirSync(packageDirectory, { recursive: true });
        const memoryHit = this.memory.find(result.scenario.fingerprint);
        if (memoryHit) result.plan.status = 'memory-hit';
        writeJson(path.join(packageDirectory, 'scenario.json'), packagedScenario(result.scenario));
        writeJson(path.join(packageDirectory, 'generation-plan.json'), result.plan);
        writeJson(path.join(packageDirectory, 'resolved-context.json'), result.resolvedContext);
        writeJson(path.join(packageDirectory, 'unresolved-context.json'), result.unresolvedContext);
        const baselinesDirectory = path.join(packageDirectory, 'baselines');
        fs.rmSync(baselinesDirectory, { recursive: true, force: true });
        const updateBaselines = result.plan.files
            .filter(file => file.operation === 'update')
            .map(file => {
                const source = path.join(this.frameworkRoot, file.path);
                const content = fs.readFileSync(source, 'utf-8');
                const reference = `baselines/${file.layer}-${path.basename(file.path)}`;
                const destination = path.join(packageDirectory, reference);
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(source, destination);
                const symbols = baselineSymbols(file.layer, content);
                return {
                    layer: file.layer,
                    path: file.path,
                    baseHash: file.baseHash,
                    reference,
                    bytes: Buffer.byteLength(content, 'utf-8'),
                    preserve: {
                        count: symbols.length,
                        sample: symbols.slice(0, 12),
                    },
                };
            });
        const reuseCandidates = (result.resolvedContext.frameworkAwareness?.candidates || [])
            .slice(0, 3)
            .map(candidate => ({
                feature: candidate.feature,
                scenario: candidate.scenario,
                caseId: candidate.caseId,
                file: candidate.file,
                score: candidate.score,
                selectorCoverage: candidate.selectorCoverage,
                matchedSteps: candidate.matchedSteps.slice(0, 3),
                paths: candidate.paths,
            }));
        writeJson(path.join(packageDirectory, 'reuse-context.json'), {
            schemaVersion: result.resolvedContext.schemaVersion,
            recordingId: result.scenario.recordingId,
            decision: result.resolvedContext.frameworkAwareness?.decision || 'create-new',
            existingCase: result.plan.existingCase,
            reuseTarget: result.plan.reuseTarget,
            candidates: reuseCandidates,
            updateBaselines,
        });
        writeJson(path.join(packageDirectory, 'collision-report.json'), {
            schemaVersion: result.resolvedContext.schemaVersion,
            recordingId: result.scenario.recordingId,
            exactStepDefinitions: result.resolvedContext.frameworkAwareness?.exactStepDefinitions || [],
            selectorCollisions: result.resolvedContext.frameworkAwareness?.selectorCollisions || [],
            requiresReuse: Boolean(result.resolvedContext.frameworkAwareness?.selectorCollisions?.length),
            blocking: !result.plan.existingCase && Boolean(
                result.resolvedContext.frameworkAwareness?.exactStepDefinitions?.length
            ),
        });
        writeJson(path.join(packageDirectory, 'agent-response.schema.json'), responseSchema());
        fs.writeFileSync(path.join(packageDirectory, 'instructions.md'), instructions(result));
        fs.writeFileSync(path.join(packageDirectory, 'verify-package.js'), verifierSource());
        for (const stale of ['agent-response.json', 'validation.json', 'repair-context.json']) {
            const file = path.join(packageDirectory, stale);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }

        let response: AutomationAgentResponse | undefined;
        let memoryVersion: number | undefined;
        if (memoryHit) {
            memoryVersion = memoryHit.entry.version;
            response = {
                ...memoryHit.response,
                recordingId: result.scenario.recordingId,
                planId: result.plan.planId,
            };
        } else if (result.plan.existingCase) {
            response = responseFromExistingFiles(result.scenario, result.plan);
        } else if (!result.plan.unresolvedGapIds.length) {
            const preview = this.generator.preview(result.scenario.request, result.scenario.actions);
            response = responseFromPreview(result.scenario, result.plan, preview);
        }

        let validation;
        if (response) {
            if (!result.plan.existingCase) {
                response = withGeneratedResponseMetadata(response, result.scenario.createdAt);
            }
            writeJson(path.join(packageDirectory, 'agent-response.json'), response);
            validation = this.validator.validate(result.scenario, result.plan, response);
            writeJson(path.join(packageDirectory, 'validation.json'), validation);
        }
        writeJson(path.join(packageDirectory, 'status.json'), {
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            state: response ? (validation?.valid ? 'ready-for-review' : 'needs-repair') : 'ready-for-agent',
            preparedAt: new Date().toISOString(),
            budgets: result.plan.budgets,
        });
        const contextBytes = [
            'scenario.json', 'generation-plan.json', 'reuse-context.json',
            'collision-report.json', 'unresolved-context.json', 'instructions.md'
        ]
            .reduce((total, file) => total + fs.statSync(path.join(packageDirectory, file)).size, 0);
        // El presupuesto es un objetivo de coste, no una condición de correctitud:
        // una grabación larga necesita legítimamente más contexto. Lanzar dejaba el
        // paquete escrito a medias y bloqueaba al QA sin alternativa.
        const contextWarning = contextBytes > result.plan.budgets.maxContextBytes
            ? `El contexto del paquete es de ${contextBytes} bytes y supera el objetivo de ` +
              `${result.plan.budgets.maxContextBytes}. El agente costará más tokens; ` +
              `considera dividir la grabación en casos más cortos.`
            : undefined;
        return {
            packageDirectory,
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            status: result.plan.status,
            deterministicCoverage: result.plan.deterministicCoverage,
            unresolvedGaps: result.plan.unresolvedGapIds.length,
            memoryVersion,
            agentRequired: !response,
            responseAvailable: Boolean(response),
            validation,
            contextBytes,
            contextWarning,
        };
    }
}
