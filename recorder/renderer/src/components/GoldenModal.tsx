export function GoldenModal() {
    return <div id="goldenModal" className="framework-recovery-overlay" style={{ display: 'none', zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="goldenTitle">
        <section className="framework-recovery-card">
            <header><h2 id="goldenTitle">Golden verificado por QA</h2><button id="btnCloseGolden" className="btn btn-dark">Cerrar</button></header>
            <p>Tu aprobación corresponde a los archivos de esta revisión. La declaración de ejecución es del QA; el recorder conserva por separado los diagnósticos automáticos.</p>
            <p id="goldenStatus" role="status" />
            <div id="goldenList" />
            <div id="goldenReview" style={{ display: 'none' }}>
                <div id="goldenFiles" />
                <pre id="goldenDiagnostics" style={{ whiteSpace: 'pre-wrap' }} />
                <label>Ejecución declarada por QA<select id="goldenExecution" className="field-select"><option value="not-run">Sin ejecutar</option><option value="passed">Ejecutado en verde</option><option value="failed">Falló al ejecutar</option></select></label>
                <label>Notas<input id="goldenNotes" className="field-input" maxLength={4000} /></label>
                <label><input id="goldenApproved" type="checkbox" /> He revisado estos archivos y apruebo esta versión como referencia golden.</label>
                <button id="btnApproveGolden" className="btn btn-green" disabled>Guardar como golden verificado por QA</button>
            </div>
            <button id="btnRebuildGolden" className="btn btn-dark">Reconstruir índice aprobado</button>
        </section>
    </div>;
}
