const HtmlWebPackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const Autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            options: { minimize: true },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              ident: 'postcss',
              plugins: () => [Autoprefixer(), cssnano()],
            },
          },
        ],
      },
      {
        test: /\.(otf|ttf|woff|woff2|png|svg)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[hash:10].[ext]',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: './src/index.html.ejs',
      filename: './index.html',
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[hash:8].css',
      chunkFilename: '[id].css',
    }),
  ],
};
