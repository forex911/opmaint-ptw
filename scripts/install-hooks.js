import fs from 'fs';
import path from 'path';

const gitDir = path.resolve(process.cwd(), '.git');
if (!fs.existsSync(gitDir)) {
  console.log('No .git directory found, skipping hook installation.');
  process.exit(0);
}

const hooksDir = path.join(gitDir, 'hooks');
if (!fs.existsSync(hooksDir)) {
  fs.mkdirSync(hooksDir, { recursive: true });
}

const preCommitHook = `#!/bin/sh
echo "Running pre-commit checks (typecheck + lint)..."
npm run typecheck || exit 1
npm run lint || exit 1
`;

const prePushHook = `#!/bin/sh
echo "Running pre-push checks (full test suite)..."
npm test || exit 1
`;

fs.writeFileSync(path.join(hooksDir, 'pre-commit'), preCommitHook, { mode: 0o755 });
fs.writeFileSync(path.join(hooksDir, 'pre-push'), prePushHook, { mode: 0o755 });

console.log('Successfully installed Git hooks (pre-commit, pre-push).');
