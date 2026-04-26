const {
  swcDefaultsFactory,
} = require('@nestjs/cli/lib/compiler/defaults/swc-defaults');

const baseSwcOptions = swcDefaultsFactory().swcOptions;
const swcOptions = { ...baseSwcOptions, swcrc: false };

module.exports = function (options) {
  return {
    ...options,
    module: {
      ...options.module,
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: { loader: 'swc-loader', options: swcOptions },
        },
      ],
    },
  };
};
