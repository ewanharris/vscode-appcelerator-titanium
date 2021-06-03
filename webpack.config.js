// @ts-check

'use strict';

const path = require('path');
const { ContextReplacementPlugin } = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const ForkTsCheckerPlugin = require('fork-ts-checker-webpack-plugin');

/** @type {import('webpack').Configuration} */
const config = {
	target: 'node',

	entry: './src/extension.ts',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'extension.js',
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../[resource-path]'
	},
	devtool: 'source-map',
	externals: {
		vscode: 'commonjs vscode'
	},
	resolve: {
		extensions: [ '.ts', '.js', '.json' ]
	},
	plugins: [
		// suppress warning from keyv
		new ContextReplacementPlugin(/keyv/),
		// bryt expects to read an index.json file, so we need to copy the lookup info over
		new CopyPlugin({
			patterns: [
				{ from: 'node_modules/bryt/lookup', to: '../lookup' },
			]
		}),
		new ForkTsCheckerPlugin({
			async: false,
			eslint: { enabled: true, files: 'src/**/*.ts', options: { cache: true } },
			formatter: 'basic',
		}),
	],
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader'
					}
				]
			}
		]
	}
};
module.exports = config;
