const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(root, ...args) {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Golden QA fixture', '-c', 'user.email=golden-fixture@example.test', '-C', root, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function recorderRepository(root) {
    fs.mkdirSync(path.join(root, 'tests/golden'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'appium-visual-recorder' }));
    fs.copyFileSync(path.join(__dirname, '../../.gitignore'), path.join(root, '.gitignore'));
    fs.copyFileSync(path.join(__dirname, '../golden/.gitattributes'), path.join(root, 'tests/golden/.gitattributes'));
    git(root, 'init', '-q', '--initial-branch=main');
    return fs.realpathSync(root);
}
module.exports = { git, recorderRepository };
