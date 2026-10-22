const path = require('node:path');

module.exports = {
  plugins: [
    require('../node_modules/tailwindcss')({
      config: path.resolve(__dirname, '../tailwind.config.ts'),
    }),
    require('../node_modules/autoprefixer'),
  ],
};
