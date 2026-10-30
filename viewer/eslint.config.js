// Lint rules for the document viewer. The document name is untrusted text: it is only ever set
// with textContent, and every raw-HTML sink is banned.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Untrusted text: use textContent.' },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Untrusted text: use DOM methods.' },
        { selector: "CallExpression[callee.property.name='write'][callee.object.name='document']", message: 'Use DOM methods.' },
      ],
    },
  },
  { files: ['**/*.js', '**/*.mjs'], ...tseslint.configs.disableTypeChecked },
);
