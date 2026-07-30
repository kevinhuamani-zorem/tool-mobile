import { CodeSubgraph, CodeGraphNode } from './codeGraph';

const colors: Record<CodeGraphNode['type'], string> = {
    feature: '#7E57C2',
    scenario: '#9575CD',
    gherkinStep: '#42A5F5',
    stepDefinition: '#26A69A',
    screenObject: '#FFA726',
    method: '#FFCA28',
    locator: '#66BB6A',
    module: '#546E7A',
    component: '#AB47BC',
    service: '#26C6DA',
    ipcChannel: '#EF5350',
    domElement: '#EC407A',
    script: '#8D6E63',
    test: '#78909C'
};

function clean(value: string): string {
    return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function dotText(value: string): string {
    return clean(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function mermaidText(value: string): string {
    return clean(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/[<>]/g, character => character === '<' ? '&lt;' : '&gt;');
}

function label(node: CodeGraphNode): string {
    const detail = node.text && node.text !== node.name ? `: ${node.text}` : `: ${node.name}`;
    return `${node.type}${detail}\n${node.file}`;
}

export function renderCodeGraphDot(graph: CodeSubgraph): string {
    const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
    return [
        'digraph CodeGraph {',
        '  rankdir=LR;',
        '  graph [bgcolor="#171725", pad="0.4", nodesep="0.35", ranksep="0.7"];',
        '  node [shape=box, style="rounded,filled", fontname="Arial", fontcolor="white"];',
        '  edge [fontname="Arial", fontsize=9, color="#8F8FA8", fontcolor="#BDBDD0"];',
        ...graph.nodes.map(node =>
            `  ${ids.get(node.id)} [label="${dotText(label(node))}", fillcolor="${colors[node.type]}"];`
        ),
        ...graph.edges.flatMap(edge => {
            const from = ids.get(edge.from);
            const to = ids.get(edge.to);
            return from && to ? [`  ${from} -> ${to} [label="${edge.type}"];`] : [];
        }),
        '}',
        ''
    ].join('\n');
}

export function renderCodeGraphMermaid(graph: CodeSubgraph): string {
    const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
    return [
        'flowchart LR',
        ...graph.nodes.map(node =>
            `  ${ids.get(node.id)}["${mermaidText(label(node))}"]`
        ),
        ...graph.edges.flatMap(edge => {
            const from = ids.get(edge.from);
            const to = ids.get(edge.to);
            return from && to ? [`  ${from} -->|${edge.type}| ${to}`] : [];
        }),
        ...Object.entries(colors).map(([type, color]) =>
            `  classDef ${type} fill:${color},color:#fff,stroke:#ddd`
        ),
        ...graph.nodes.map(node => `  class ${ids.get(node.id)} ${node.type}`),
        ''
    ].join('\n');
}
