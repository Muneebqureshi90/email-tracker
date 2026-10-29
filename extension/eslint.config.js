// Lint rules for the extension. Subjects and user agents are untrusted text, so every HTML-string
// sink is banned: DOM nodes are built with createElement/textContent or React only.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '*.mjs'] },
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
        { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Untrusted text: use textContent.' },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Untrusted text: build DOM nodes.' },
        { selector: "CallExpression[callee.property.name='insertHTMLIntoBodyAtCursor']", message: 'Build DOM nodes instead.' },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Untrusted text: let React escape it.' },
      ],
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
);
