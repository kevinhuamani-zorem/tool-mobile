export function FrameworkRecoveryModal() {
    return <div id="frameworkRecoveryModal" className="framework-recovery-overlay" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="frameworkRecoveryTitle">
        <section className="framework-recovery-card">
            <header><div><h2 id="frameworkRecoveryTitle">Recuperar cambios del framework</h2>
                <p>Revisa las correcciones locales y guárdalas como una revisión del caso. No necesitas commit, conexión al dispositivo ni aprobación del PR.</p></div>
                <button id="btnCloseFrameworkRecovery" className="btn btn-dark" aria-label="Cerrar recuperación">Cerrar</button></header>
            <div className="framework-recovery-fields">
                <label>Grabación<select id="cmbFrameworkRecoveryCase" className="field-select"><option value="">Caso de la revisión actual</option></select></label>
                <label>PR (opcional)<input id="txtFrameworkRecoveryPr" className="field-input" type="url" placeholder="https://github.com/equipo/framework/pull/123" /></label>
                <label>Notas del QA (opcional)<input id="txtFrameworkRecoveryNotes" className="field-input" maxLength={4000} /></label>
            </div>
            <details><summary>Asociar archivos movidos o símbolos que no se reconocieron</summary>
                <p>Indica rutas relativas al framework. Los cambios sin asociación pueden guardarse como pendientes.</p>
                <label>Una asociación por línea: ruta anterior → ruta actual<textarea id="txtFrameworkRecoveryPaths" className="field-input" rows={3} placeholder="screenobjects/payment/case.screen.ts → screenobjects/payment/renamed.screen.ts" /></label>
                <label>Símbolos adicionales del caso: ruta # símbolo1, símbolo2<textarea id="txtFrameworkRecoverySymbols" className="field-input" rows={3} placeholder="support/utils/case-helper.ts # verifyReceipt" /></label>
                <small>Usa * como símbolo solo si todo el archivo pertenece al caso.</small>
            </details>
            <div className="framework-recovery-actions"><button id="btnPreviewFrameworkRecovery" className="btn btn-navy">Comparar cambios</button>
                <button id="btnSaveFrameworkRecovery" className="btn btn-green" disabled>Guardar revisión QA</button>
                <button id="btnRecoveryGolden" className="btn btn-green" disabled>Revisar como golden</button></div>
            <p id="lblFrameworkRecoveryStatus" role="status" />
            <div id="frameworkRecoveryPending" />
            <div id="frameworkRecoveryFiles" />
        </section>
    </div>;
}
