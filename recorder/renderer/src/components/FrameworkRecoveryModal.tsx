export function FrameworkRecoveryModal() {
    return <div id="frameworkRecoveryModal" className="framework-recovery-overlay" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="frameworkRecoveryTitle" aria-describedby="frameworkRecoveryDescription">
        <section className="framework-recovery-card">
            <header><div><h2 id="frameworkRecoveryTitle">Recuperar cambios del framework</h2>
                <p id="frameworkRecoveryDescription">Trae al Recorder las correcciones que hiciste en el framework y prepara una versión para revisar como golden. Puedes hacerlo sin conectar un dispositivo.</p></div>
                <button id="btnCloseFrameworkRecovery" className="btn btn-dark" aria-label="Cerrar recuperación">Cerrar</button></header>
            <ol className="framework-recovery-guide" aria-label="Pasos para recuperar y aprobar un caso">
                <li id="frameworkRecoveryStepCompare" aria-current="step"><strong>1. Compara</strong><span>Elige el caso y revisa qué cambió desde su exportación.</span></li>
                <li id="frameworkRecoveryStepSave"><strong>2. Guarda la revisión QA</strong><span>Conserva las correcciones junto a la grabación original.</span></li>
                <li id="frameworkRecoveryStepGolden"><strong>3. Revisa como golden</strong><span>Aprueba los archivos que servirán como ejemplo para el equipo.</span></li>
            </ol>
            <div className="framework-recovery-fields">
                <label>Grabación a recuperar<select id="cmbFrameworkRecoveryCase" className="field-select" aria-describedby="frameworkRecoveryCaseHelp"><option value="">Caso de la revisión actual</option></select>
                    <small id="frameworkRecoveryCaseHelp">Elige un caso que ya hayas exportado al framework del squad seleccionado.</small></label>
                <label>Enlace del PR (opcional)<input id="txtFrameworkRecoveryPr" className="field-input" type="url" placeholder="https://github.com/equipo/framework/pull/123" aria-describedby="frameworkRecoveryPrHelp" />
                    <small id="frameworkRecoveryPrHelp">Solo se guarda como referencia. Puedes recuperar nuevas correcciones durante el PR, sin esperar su aprobación.</small></label>
                <label>Qué corregiste (opcional)<input id="txtFrameworkRecoveryNotes" className="field-input" maxLength={4000} placeholder="Por ejemplo: ajusté la validación del monto enviado" /></label>
            </div>
            <details><summary>Opciones avanzadas: archivos movidos o símbolos sin reconocer</summary>
                <p>Usa estas asociaciones solo si faltan cambios del caso en la comparación. Los cambios sin asociación pueden guardarse como pendientes.</p>
                <label>Una asociación por línea: ruta anterior → ruta actual<textarea id="txtFrameworkRecoveryPaths" className="field-input" rows={3} placeholder="screenobjects/payment/case.screen.ts → screenobjects/payment/renamed.screen.ts" /></label>
                <label>Símbolos adicionales del caso: ruta # símbolo1, símbolo2<textarea id="txtFrameworkRecoverySymbols" className="field-input" rows={3} placeholder="support/utils/case-helper.ts # verifyReceipt" /></label>
                <small>Indica rutas relativas al framework. Usa * como símbolo solo si todo el archivo pertenece al caso.</small>
            </details>
            <p id="lblFrameworkRecoveryStatus" className="framework-recovery-status" role="status" aria-live="polite" />
            <div id="frameworkRecoveryPending" />
            <div id="frameworkRecoveryFiles" />
            <div className="framework-recovery-actions">
                <div className="framework-recovery-action"><button id="btnPreviewFrameworkRecovery" className="btn btn-navy" aria-describedby="frameworkRecoveryCompareHelp">Comparar cambios</button>
                    <small id="frameworkRecoveryCompareHelp">Lee los archivos actuales del framework para que puedas revisarlos.</small></div>
                <div className="framework-recovery-action"><button id="btnSaveFrameworkRecovery" className="btn btn-green" aria-describedby="frameworkRecoverySaveHelp" disabled>Guardar revisión QA</button>
                    <small id="frameworkRecoverySaveHelp">Se habilita después de comparar los archivos.</small></div>
                <div className="framework-recovery-action"><button id="btnRecoveryGolden" className="btn btn-navy" aria-describedby="frameworkRecoveryGoldenHelp" disabled>Revisar como golden →</button>
                    <small id="frameworkRecoveryGoldenHelp">Se habilita después de guardar la revisión QA.</small></div>
            </div>
            <p className="framework-recovery-next-step">La recuperación conserva el escenario grabado y lee el framework sin modificarlo. Guardar la revisión QA todavía no aprueba un golden; la aprobación se realiza en el siguiente paso.</p>
        </section>
    </div>;
}
