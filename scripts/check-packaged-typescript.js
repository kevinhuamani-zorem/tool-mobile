const fs = require('node:fs');
const path = require('node:path');

function checkPackagedTypeScript(appRoot) {
    const lib = path.join(appRoot, 'node_modules/typescript/lib');
    const sourceLib = path.dirname(require.resolve('typescript'));
    // Standard libraries are runtime inputs to the preview compiler, not dev-only types.
    for (const name of fs.readdirSync(sourceLib).filter(name => /^lib.*\.d\.ts$/.test(name))) {
        const target = path.join(lib, name);
        if (!fs.existsSync(target) || !fs.readFileSync(target).equals(fs.readFileSync(path.join(sourceLib, name)))) {
            throw new Error(`Runtime TypeScript incompleto: ${name} ausente o distinto en la aplicación.`);
        }
    }
    const ts = require(path.join(lib, 'typescript.js'));
    const options = { noEmit: true, strict: true, skipLibCheck: true, types: [], lib: ['lib.es2021.d.ts', 'lib.dom.d.ts'] };
    const source = path.join(appRoot, 'typescript-packaging-probe.ts');
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (file, version, ...args) => file === source
        ? ts.createSourceFile(file, 'const values: Array<Promise<string>> = [Promise.resolve("ok")];', version, true)
        : getSourceFile(file, version, ...args);
    const errors = ts.getPreEmitDiagnostics(ts.createProgram([source], options, host));
    if (errors.length) throw new Error(`Runtime TypeScript no compila: ${ts.flattenDiagnosticMessageText(errors[0].messageText, '\n')}`);
}

module.exports = async context => {
    if (context.electronPlatformName !== 'darwin') return;
    const appRoot = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources/app');
    checkPackagedTypeScript(appRoot);
    console.log('Runtime TypeScript empaquetado: librerías y compilación verificadas.');
};
module.exports.checkPackagedTypeScript = checkPackagedTypeScript;
