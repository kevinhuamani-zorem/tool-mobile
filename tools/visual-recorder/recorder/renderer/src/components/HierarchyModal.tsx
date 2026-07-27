// @ts-nocheck -- marcado para tipado incremental.
export function HierarchyModal() {
  return (
    <div id="xmlModal" className="xml-modal" style={{display: 'none'}}>
      <div className="xml-modal-content">
        <div className="xml-modal-header">
          <div>
            <span className="section-title">🔍 XML Hierarchy Viewer</span>
            <span id="xmlAssignmentTarget" className="xml-assignment-target" />
          </div>
          <div className="xml-modal-actions">
            <button className="btn btn-dark" id="btnCopyXml" title="Mostrar XML completo">📋 XML</button>
            <button className="btn btn-dark" id="btnCopyTree" title="Mostrar árbol de elementos">🌳 Árbol</button>
            <button className="btn btn-dark" id="btnCopyHierarchy" title="Copiar la vista actual">📄 Copiar</button>
            <button className="btn btn-blue" id="btnRefreshXml">🔄 Refresh</button>
            <button className="btn btn-dark" id="btnCloseXml">✕ Cerrar</button>
          </div>
        </div>
        <div className="xml-modal-body">
          {/* Screenshot interactivo */}
          <div className="hier-device">
            <div className="section-title" style={{marginBottom: 6}}>
              📱 Click en elemento
            </div>
            <div className="hier-screen-wrap" id="hierScreenWrap">
              <img id="hierImg" className="hier-screen" src alt />
              <canvas id="hierCanvas" className="hier-canvas" />
            </div>
          </div>
          {/* Árbol o XML crudo */}
          <div className="hier-tree-panel">
            <div className="section-title" id="lblHierarchyMode" style={{marginBottom: 6}}>🌳 Hierarchy</div>
            <div id="hierTree" className="hier-tree">
              <span className="hier-hint">Haz click en la imagen</span>
            </div>
          </div>
          {/* Atributos + selector */}
          <div className="hier-attrs-panel">
            <div className="section-title" style={{marginBottom: 6}}>📋 Atributos</div>
            <div id="hierAttrs" className="hier-attrs">
              <span className="hier-hint">Selecciona un elemento</span>
            </div>
            <div className="separator" style={{margin: '8px 0'}} />
            <div className="section-title" style={{marginBottom: 6}}>🎯 Selectores sugeridos</div>
            <div id="hierXpathSuggestions" className="xpath-suggestions" />
            <label className="field-label" style={{marginTop: 8}}>Estrategia:</label>
            <select id="cmbLocatorStrategy" className="field-select">
              <option value="accessibility">Accessibility ID</option>
              <option value="id">ID</option>
              <option value="class">Class Name</option>
              <option value="xpath">XPath</option>
              <option value="android">Android UIAutomator</option>
              <option value="iosPredicate">iOS Predicate String</option>
              <option value="iosClassChain">iOS Class Chain</option>
            </select>
            <label className="field-label" style={{marginTop: 8}}>Valor del selector:</label>
            <textarea id="txtLocatorValue" className="xpath-manual" placeholder="com.example:id/login_button" defaultValue={""} />
            <div className="btn-row" style={{marginTop: 6}}>
              <button className="btn btn-navy btn-half" id="btnVerifyXpathManual">✅ Verificar</button>
              <button className="btn btn-green btn-half" id="btnUseXpath">⬆️ Usar</button>
            </div>
            <div id="lblXmlVerify" className="verify-result" style={{marginTop: 6}}>
              — Verifica antes de usar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
