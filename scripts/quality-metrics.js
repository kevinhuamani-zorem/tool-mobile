const {
    validateGenerationPlan,
    calculatePlanMetrics
} = require('../dist/ai/generationPlan');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');
const { CodeGraph } = require('../dist/core/codeGraph');

const actions = [
    { action: 'CLICK', variableName: 'btnLogin' },
    { action: 'TYPE', variableName: 'txtEmail' },
    { action: 'VERIFY_TEXT', variableName: 'lblWelcome' }
];
const plan = validateGenerationPlan({
    featureName: 'Inicio de sesión',
    scenarioName: 'Ingreso exitoso',
    fileName: 'inicio-sesion',
    locatorModule: 'login',
    rows: [
        {
            keyword: 'Given', text: 'el usuario abre el inicio de sesión',
            actionIndices: [0], methodName: 'abrirInicioSesion'
        },
        {
            keyword: 'When', text: 'ingresa el correo <correoUser>',
            actionIndices: [1], methodName: 'ingresarCorreo'
        },
        {
            keyword: 'Then', text: 'visualiza el mensaje de bienvenida',
            actionIndices: [2], methodName: 'validarBienvenida'
        }
    ],
    actionNames: [
        { actionIndex: 0, locatorName: 'btnLogin' },
        { actionIndex: 1, locatorName: 'txtEmail' },
        { actionIndex: 2, locatorName: 'lblWelcome' }
    ],
    assumptions: [],
    warnings: []
}, actions);
const metrics = calculatePlanMetrics(plan, actions.length);
const generationActions = [
    { action: 'CLICK', variableName: 'btnLogin', selector: '~Iniciar sesión' },
    { action: 'ESCRIBIR', variableName: 'txtEmail', selector: '~Correo', value: '<correoUser>' },
    { action: 'VERIFICAR_TEXTO', variableName: 'lblWelcome', selector: '~Bienvenido', value: 'Bienvenido' }
];
const generatedPreview = new FwkMobileGenerator().preview({
    squad: 'payment',
    featureName: plan.featureName,
    scenarioName: plan.scenarioName,
    fileName: plan.fileName,
    locatorModule: plan.locatorModule,
    caseId: 'TC-10239',
    pathType: 'Happy Path',
    tag: 'login',
    platform: 'android',
    examples: { correoUser: 'qa@example.com' },
    scenarioRows: plan.rows.map(row => ({
        keyword: row.keyword,
        text: row.text,
        status: 'missing',
        methodName: row.methodName,
        actions: row.actionIndices.map(index => generationActions[index])
    }))
}, generationActions);
const requiredLayers = ['featurePath', 'stepPath', 'locatorPath', 'screenPath'];
const generatedLayers = requiredLayers.filter(key => Boolean(generatedPreview[key])).length;
const graphMetrics = new CodeGraph().query({
    squad: 'payment',
    actions: generationActions,
    limit: 80
}).metrics;
const thresholds = {
    actionCoverage: 1,
    linkedRowCoverage: 1,
    duplicateRows: 0,
    qualityScore: 90,
    generatedLayerCoverage: 1,
    codeGraphContextReduction: 0.5
};
const result = {
    generatedAt: new Date().toISOString(),
    metrics: {
        ...metrics,
        linkedRowCoverage: metrics.linkedRows / metrics.totalRows,
        generatedLayers,
        generatedLayerCoverage: generatedLayers / requiredLayers.length,
        codeGraphContextReduction: graphMetrics.contextReduction,
        codeGraphSelectedNodes: graphMetrics.selectedNodes,
        codeGraphTotalNodes: graphMetrics.totalNodes,
        codeGraphReindexedFiles: graphMetrics.reindexedFiles
    },
    thresholds
};

console.log(JSON.stringify(result, null, 2));
if (
    result.metrics.actionCoverage < thresholds.actionCoverage ||
    result.metrics.linkedRowCoverage < thresholds.linkedRowCoverage ||
    result.metrics.duplicateRows > thresholds.duplicateRows ||
    result.metrics.qualityScore < thresholds.qualityScore ||
    result.metrics.generatedLayerCoverage < thresholds.generatedLayerCoverage ||
    result.metrics.codeGraphContextReduction < thresholds.codeGraphContextReduction
) {
    process.exitCode = 1;
}
