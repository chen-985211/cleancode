export default {
  '*.{ts,tsx,js,jsx,mjs,cjs,json,css,html}': ['prettier --check'],
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['eslint --max-warnings=0']
}
