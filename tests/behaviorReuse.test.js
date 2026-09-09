const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { indexMethodBehaviors, stepDelegation } = require('../dist/core/indexing/domain/behaviorContract');
const { resolveBehaviorRows } = require('../dist/core/automation/application/resolver/behaviorReuse');
const { buildReuseReport } = require('../dist/core/automation/application/resolver/reuseReport');
const { evaluateBehaviorReuse } = require('../dist/core/automation/domain/reuseEvaluation');
const { mergeFeatureUpdate } = require('../dist/core/generation/infrastructure/deterministicGenerator');
const { behaviorReuseRules } = require('../dist/core/validation/infrastructure/rules/behaviorReuseRules');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { projectPaths } = require('../dist/core/workspace');
const { ReuseAnalyzer } = require('../dist/core/indexing');
const { isolatedFramework } = require('./helpers/isolatedFramework');

isolatedFramework({ after: fn => test.after(fn) }, 'avr-behavior-reuse-');
const SCREEN = 'screenobjects/payment/behavior-reuse.screen.ts';
const LOCATORS = 'resources/locators/payment/behavior-reuse.locator.json';
const STEPS = 'features/yape-steps-definitions/payment/behavior-reuse.steps.ts';
function getter(name) {
    return `public get ${name}() { const locator = LocatorProvider.getElement(TypeLocator.XPATH, L.demoIos.${name}, TypeLocator.ID, L.demoAndroid.${name}); return $(locator); }`;
}
function source(body = '') {
    return ts.createSourceFile(SCREEN, `class Screen { ${['title','filter','option30','back'].map(getter).join('\n')} ${body} } export default new Screen();`, ts.ScriptTarget.Latest, true);
}
function contract(body, name = 'show', helpers = new Set()) {
    const s = source(body); return indexMethodBehaviors(s, s.statements[0], helpers).get(name);
}
function method(name, body, helpers) {
    return { name, file: SCREEN, squad: 'payment', locatorFiles: [LOCATORS], signature: `${name}(): Promise<void>`,
        locatorKeys: ['title'], className: 'Screen', visibility: 'public', behavior: contract(body, name, helpers) };
}
function locator(name, selector = name, overrides = {}) {
    return { name, selector, file: LOCATORS, module: 'payment/behavior-reuse', scope: 'squad', platform: 'android',
        androidSelector: selector, androidBlock: 'demoAndroid', androidStrategy: 'ID', iosSelector: '', iosBlock: 'demoIos', ...overrides };
}
function definition(text, methodName, assertsBoolean = false) {
    return { keyword: 'Then', expression: `^${text}$`, file: STEPS, squad: 'payment', scope: 'squad',
        screenMethods: [{ file: SCREEN, method: methodName }], delegation: { alias: 'screen', method: methodName, assertsBoolean } };
}
function catalog(methods, definitions = [], locators = [locator('title'), locator('aliasTitle','title')]) {
    return { squad: 'payment', platform: 'android', revision: 'test-revision', screenMethods: methods,
        stepDefinitions: definitions, frameworkStepDefinitions: definitions, locators, scenarios: [], artifactBundles: [], features: [] };
}
function actions(kinds, names, values = []) {
    return kinds.map((action, i) => ({ sequence: i + 1, action, variableName: names[i], selector: `id=${names[i]}`, value: values[i] || '' }));
}
function resolutions(steps) {
    return steps.map(a => ({ sequence: a.sequence, action: a.action, resolution: 'reuse', locatorName: a.variableName,
        source: { file: LOCATORS, module: 'payment/behavior-reuse', scope: 'squad' }, reason: 'Recorded pair', selector: a.selector }));
}
function rows(steps) { return steps.map(action => ({ keyword: 'Then', text: 'se muestra la pantalla', status: 'missing', actions: [action] })); }
const SHOW = 'public async show(): Promise<void> { await this.title.waitForDisplayed(); }';

test('R1/R2: comportamiento y firma permiten reutilizar un Step con texto y alias diferentes', () => {
    const steps = actions(['VERIFICAR_EXISTE'], ['aliasTitle']);
    const c = catalog([method('show', SHOW)], [definition('se muestran los movimientos esperados', 'show')]);
    const rs = resolutions(steps);
    const result = resolveBehaviorRows(rows(steps), c, rs, SCREEN);
    assert.equal(result[0].status, 'reused');
    assert.equal(result[0].text, 'se muestran los movimientos esperados');
    assert.equal(result[0].reuse.returnType, 'void');
    assert.equal(rs[0].locatorName, 'title');
});

for (const [name, body] of Object.entries({
    branch: 'if (flag) await this.title.click();',
    unawaited: 'this.title.click();',
    sideEffect: 'await this.title.click(); await sendMoney();',
    ignoredBoolean: 'const ok = await this.title.isDisplayed();',
    unknownHelper: 'await this.uiHelper.unknown(this.title);',
    literalSelector: 'await $("//invented").click();',
    reversedWait: 'await this.title.waitForDisplayed({ reverse: true });',
    computedWait: 'await this.title.waitForDisplayed(await changeState());',
    changedTextMatcher: 'await expect(this.title).toHaveText("Movimientos", { containing: true });',
})) test(`R2: no afirma equivalencia con ${name}`, () => {
    assert.equal(contract(`public async show(): Promise<void> { ${body} }`).complete, false);
});

test('R2: mismo elemento con acción diferente no se reutiliza', () => {
    const steps = actions(['CLICK'], ['title']);
    assert.equal(resolveBehaviorRows(rows(steps), catalog([method('show', SHOW)], [definition('pantalla visible','show')]), resolutions(steps), SCREEN)[0].status, 'missing');
});

for (const mismatch of ['strategy', 'screen', 'platform', 'value']) test(`R2: rechaza coincidencia con distinto ${mismatch}`, () => {
    const steps = actions(['VERIFICAR_EXISTE'], ['aliasTitle']);
    const altered = locator('title', 'title', mismatch === 'strategy' ? { androidStrategy:'XPATH' }
        : mismatch === 'platform' ? { iosSelector:'different', iosStrategy:'XPATH' }
        : mismatch === 'value' ? { androidSelector:'different' } : {});
    const c = catalog([method('show', SHOW)], [definition('pantalla visible','show')], [altered, locator('aliasTitle','title')]);
    assert.equal(resolveBehaviorRows(rows(steps), c, resolutions(steps), mismatch === 'screen' ? 'another.screen.ts' : SCREEN)[0].reuse, undefined);
});

test('R3: agrupa abrir filtro, verificar 30 días y seleccionar sin perder el orden', () => {
    const body = `public async select30(): Promise<void> { await this.filter.click(); await expect(this.option30).toHaveText('Últimos 30 días'); await this.option30.click(); }`;
    const steps = actions(['CLICK','VERIFICAR_TEXTO','CLICK'], ['filter','option30','option30'], ['', 'Últimos 30 días']);
    const c = catalog([method('select30',body)], [definition('el usuario filtra los últimos 30 días','select30')], [locator('filter'),locator('option30')]);
    const result = resolveBehaviorRows(rows(steps), c, resolutions(steps), SCREEN);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].reuse.sequences, [1,2,3]);
    assert.equal(result[0].status, 'reused');
    const reversed = [steps[2], steps[1], steps[0]].map((a,i)=>({...a,sequence:i+1}));
    assert.equal(resolveBehaviorRows(rows(reversed),c,resolutions(reversed),SCREEN).some(r=>r.reuse),false);
});

test('R3: nunca sustituye una verificación de texto por mera presencia', () => {
    const steps=actions(['VERIFICAR_TEXTO'],['title'],['Últimos 90 días']);
    assert.equal(resolveBehaviorRows(rows(steps),catalog([method('show',SHOW)],[definition('fecha correcta','show')]),resolutions(steps),SCREEN)[0].reuse,undefined);
});

test('R3: no usa un Step que dice 30 días para una verificación sin ese dato', () => {
    const steps=actions(['VERIFICAR_EXISTE'],['title']);
    const result=resolveBehaviorRows(rows(steps),catalog([method('show',SHOW)],[definition('fecha filtrada por 30 días','show')]),resolutions(steps),SCREEN);
    assert.equal(result[0].reuse.kind,'method');
    assert.equal(result[0].text,'se muestra la pantalla');
});

test('R3: respeta operador y origen de una aserción explícita', () => {
    const body=`public async show(): Promise<void> { await expect(this.title).toHaveText('Movimientos'); }`;
    for(const assertion of [{version:1,source:'element',operator:'contains'},{version:1,source:'container',operator:'equals'}]) {
        const steps=actions(['VERIFICAR_TEXTO'],['title'],['Movimientos']);steps[0].textAssertion=assertion;
        assert.equal(resolveBehaviorRows(rows(steps),catalog([method('show',body)],[definition('titulo correcto','show')]),resolutions(steps),SCREEN)[0].reuse,undefined);
    }
});

test('R3/R4: método boolean requiere aserción en su Step y no se duplica el Screen', () => {
    const body=`public async show(): Promise<boolean> { return await this.uiHelper.waitForElementExistByLocator(this.title,true); }`;
    const m=method('show',body,new Set(['uiHelper.waitForElementExistByLocator']));
    const steps=actions(['VERIFICAR_EXISTE'],['title']);
    const result=resolveBehaviorRows(rows(steps),catalog([m],[definition('pantalla visible','show',false)]),resolutions(steps),SCREEN);
    assert.equal(result[0].reuse.kind,'method');
    const preview=new FwkMobileGenerator().preview({squad:'payment',caseId:'TC-99101',featureName:'Behavior',scenarioName:'Ver pantalla',fileName:'behavior-check',locatorModule:'behavior-check',pathType:'Happy Path',platform:'android',tag:'behavior_check',scenarioRows:result},steps);
    assert.match(preview.stepContent,/const visible: boolean = await behaviorCheckScreen.show\(\)/);
    assert.match(preview.stepContent,/expect\(visible\).toBe\(true\)/);
    assert.doesNotMatch(preview.screenContent,/public async show\(/);
});

test('R4: conserva implementación y traza; detecta reescritura del método', () => {
    const steps=actions(['VERIFICAR_EXISTE'],['title']);
    const rs=resolutions(steps);
    const row=resolveBehaviorRows(rows(steps),catalog([method('show',SHOW)],[definition('pantalla visible','show')]),rs,SCREEN)[0];
    const context={scenario:{request:{scenarioRows:[row]}},response:{files:[{path:SCREEN,content:source(SHOW).text}],actionTrace:[{sequence:1,screenMethod:'show'}]}};
    let report={errors:[],warnings:[]};behaviorReuseRules(context,report);assert.deepEqual(report.errors,[]);
    context.response.files[0].content=source(SHOW.replace('waitForDisplayed','click')).text;
    report={errors:[],warnings:[]};behaviorReuseRules(context,report);assert.ok(report.errors.some(e=>e.code==='reuse-implementation-changed'));
});

test('R1: el mismo ReuseAnalyzer detecta ediciones locales con mismo tamaño y mtime restaurado', () => {
    const file=path.join(projectPaths.frameworkRoot,SCREEN);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source(SHOW).text);
    const analyzer=new ReuseAnalyzer();const first=analyzer.getCatalog('payment','android');const stat=fs.statSync(file);
    const original=fs.readFileSync(file,'utf8');fs.writeFileSync(file,original.replace('show()','test()'));fs.utimesSync(file,stat.atime,stat.mtime);
    const next=analyzer.getCatalog('payment','android');assert.notEqual(first.revision,next.revision);
    assert.ok(next.screenMethods.some(m=>m.file===SCREEN&&m.name==='test'));
    fs.unlinkSync(file);const last=analyzer.getCatalog('payment','android');assert.ok(!last.screenMethods.some(m=>m.file===SCREEN));
});

test('R1/R3: helper del framework se acepta por implementación; un cambio invalida su perfil', () => {
    const analyzer=new ReuseAnalyzer();const first=analyzer.getCatalog('payment','android');
    assert.equal(first.screenMethods.find(m=>m.name==='showMovementsExpected').behavior.complete,true);
    const helper=path.join(projectPaths.frameworkRoot,'screenobjects/commons/core/UIHelper.ts');const original=fs.readFileSync(helper,'utf8');
    try { fs.writeFileSync(helper,original.replace('await expect(element).toBeDisplayed();','await element.click();'));
        const next=analyzer.getCatalog('payment','android');assert.equal(next.screenMethods.find(m=>m.name==='showMovementsExpected').behavior.complete,false);
    } finally {fs.writeFileSync(helper,original);}
});

test('R5: una colisión de definiciones no se adopta; puede reutilizar el método', () => {
    const d=definition('pantalla visible','show');const c=catalog([method('show',SHOW)],[d,{...d,file:'other.steps.ts'}]);
    const steps=actions(['VERIFICAR_EXISTE'],['title']);assert.equal(resolveBehaviorRows(rows(steps),c,resolutions(steps),SCREEN)[0].reuse.kind,'method');
});

test('R5: mismo TC renombrado actualiza su bloque, conservando otros casos', () => {
    const baseline='Feature: Ejemplo\n Scenario: [TC-1] Antiguo\n  When consulta\n\n Scenario: [TC-2] Otro\n  Then existe\n';
    const generated='Feature: Ejemplo\n Scenario: [TC-1] Nuevo\n  When consulta\n  Then visible\n';
    const out=mergeFeatureUpdate(baseline,generated,true);
    assert.equal((out.match(/\[TC-1\]/g)||[]).length,1);assert.match(out,/\[TC-2\] Otro/);assert.match(out,/Then visible/);
});

test('R5: reducción de cobertura queda como conflicto visible, nunca sobrescritura silenciosa', () => {
    const baseline='Feature: Movimientos\n Scenario: [TC-10140] Filtros\n  When filtro hoy\n  Then valida hoy\n  When filtro 30\n  Then valida 30\n';
    const generated='Feature: Movimientos\n Scenario: [TC-10140] Filtros nuevos\n  When filtro 30\n  Then fecha visible\n';
    const out=mergeFeatureUpdate(baseline,generated,true);
    assert.match(out,/<<<<<<< COBERTURA EXISTENTE/);assert.match(out,/Then valida hoy/);assert.match(out,/Then fecha visible/);
});

test('R6: métricas usan expectativas independientes y no acreditan ejecución ni golden', () => {
    const decisions=[{kind:'step',sequences:[1,2,3],method:'open'},{kind:'create',sequences:[4]},{kind:'method',sequences:[5],method:'back'}];
    const report={decisions};const groups=[{sequences:[1,2,3],expected:'reuse',method:'open'},{sequences:[4],expected:'reuse'},{sequences:[5],expected:'create'}];
    const result=evaluateBehaviorReuse(report,{groups});assert.equal(result.reuseRate,null);assert.equal(result.status,'not-evaluated');assert.equal(result.plannedDecisionAudit.reuseRate,0.5);assert.equal(result.plannedDecisionAudit.incorrectlyReused,1);assert.equal(result.plannedDecisionAudit.missedReuse,1);assert.equal(result.qaMinutes,null);assert.equal(result.goldenApproval,'not-granted');
    assert.throws(()=>evaluateBehaviorReuse(report,{groups:[]}),/independientes/);
    assert.throws(()=>evaluateBehaviorReuse(report,{groups:[...groups,groups[0]]}),/solaparse/);
});

test('R6: el informe separa presencia de validación funcional y conserva candidatos del mismo TC', () => {
    const steps=actions(['VERIFICAR_EXISTE'],['title']);const c=catalog([],[]);c.scenarios=[{caseId:'TC-1',file:'existing.feature',name:'Filtro',steps:[{}]}];
    const report=buildReuseReport(rows(steps),c,{request:{caseId:'TC-1'},actions:steps});
    assert.equal(report.metrics.newImplementations,1);assert.equal(report.sameCase.length,1);assert.ok(report.observations.some(o=>o.includes('rangos de fechas')));
});

test('R3: un Step con efectos adicionales o retorno ignorado no prueba delegación', () => {
    const code="When(/^pantalla$/,async()=>{ await screen.show(); await other.transfer(); });";
    assert.equal(stepDelegation(ts.createSourceFile('steps.ts',code,ts.ScriptTarget.Latest,true),'^pantalla$'),undefined);
});


test('R2: una clase que no es la exportada no se toma como implementación del Step', () => {
    const steps = actions(['VERIFICAR_EXISTE'], ['title']);
    const candidate = { ...method('show', SHOW), exported: false };
    const result = resolveBehaviorRows(rows(steps), catalog([candidate], [definition('pantalla visible', 'show')]), resolutions(steps), SCREEN);
    assert.equal(result[0].reuse, undefined);
});
