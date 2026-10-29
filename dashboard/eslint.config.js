// Lint rules for the dashboard. Subjects, names and user agents are untrusted text: React escapes
// them, and every raw-HTML sink is banned.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Untrusted text: use React or textContent.' },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Untrusted text: use React.' },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Untrusted text: let React escape it.' },
      ],
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
);
