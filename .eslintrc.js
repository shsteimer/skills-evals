module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
  },
  overrides: [
    {
      // CLI tools have different requirements than web code
      files: ['tools/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        'no-console': 'off', // console is expected in CLI tools
        'no-underscore-dangle': ['error', {
          allow: ['__filename', '__dirname', '_path', '_relativePath'], // ES modules + test metadata
        }],
        'no-restricted-syntax': ['error',
          'ForInStatement',
          'LabeledStatement',
          'WithStatement',
        ], // allow for...of
        'no-await-in-loop': 'off', // sequential operations are sometimes needed
        'no-plusplus': 'off', // i++ is fine in CLI scripts
        'no-use-before-define': ['error', { functions: false }], // allow hoisting helper functions
        'import/prefer-default-export': 'off', // named exports are clearer for modules
        'no-continue': 'off', // continue is useful for control flow in processing loops
        'function-paren-newline': 'off', // allow breaking long function calls
      },
    },
  ],
};
