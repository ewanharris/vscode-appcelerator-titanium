import * as fs from 'fs-extra';
import * as path from 'path';
import appc from '../appc';

import { window, workspace } from 'vscode';
import { inputBox, quickPick } from '../quickpicks';
import { capitalizeFirstLetter } from '../utils';
import { UserCancellation } from './common';
import { ExtensionContainer } from '../container';
import { AlloyGenerateMetrics, AlloyGenerateEventClassification } from '../types/telemetry';

export enum AlloyModelAdapterType {
	Properties = 'properties',
	SQL = 'sql'
}

export enum AlloyComponentType {
	Controller = 'controller',
	Migration = 'migration',
	Model = 'model',
	Style = 'style',
	View = 'view',
	Widget = 'widget'
}

export enum AlloyComponentFolder {
	Controller = 'controllers',
	Migration = 'migrations',
	Model = 'models',
	Style = 'style',
	View = 'views',
	Widget = 'widgets'
}
export enum AlloyComponentExtension {
	Controller = '.js',
	Migration = '.js',
	Model = '.js',
	Style = '.tss',
	View = '.xml',
	Widget = ''
}

async function promptForDetails (type: AlloyComponentType, folder: AlloyComponentFolder, extension: AlloyComponentExtension):
Promise<{ cwd: string; filePaths: string[]; name: string; type: AlloyComponentType }> {
	const name = await inputBox({ prompt: `Enter the name for your ${type}` });

	const cwd = workspace.rootPath!;
	const mainFile = path.join(cwd, 'app', folder, `${name}${extension}`);
	const filePaths = [];
	if (type === AlloyComponentType.Widget) {
		filePaths.push(
			path.join(mainFile, 'controllers', 'widget.js'),
			path.join(mainFile, 'styles', 'widget.tss'),
			path.join(mainFile, 'views', 'widget.xml')
		);
	} else {
		filePaths.push(mainFile);
	}
	if (await fs.pathExists(mainFile)) {
		const shouldDelete = await quickPick([ { id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' } ], { placeHolder: ` ${name} already exists. Overwrite it?` });
		if (shouldDelete.id === 'no') {
			throw new UserCancellation();
		}
	}
	return { cwd, filePaths, name, type };
}

export async function generateComponent (type: AlloyComponentType, folder: AlloyComponentFolder, extension: AlloyComponentExtension): Promise<void> {
	let name;
	try {
		const creationArgs = await promptForDetails(type, folder, extension);
		const cwd = creationArgs.cwd;
		const filePaths = creationArgs.filePaths;
		name = creationArgs.name;

		await appc.generate({
			cwd,
			type,
			name,
			force: true
		});
		const shouldOpen = await window.showInformationMessage(`${capitalizeFirstLetter(type)} ${name} created successfully`, { title: 'Open' });
		if (shouldOpen) {
			for (const file of filePaths) {
				const document = await workspace.openTextDocument(file);
				await window.showTextDocument(document, { preview: false });
			}

		}

		ExtensionContainer.publicLog2<AlloyGenerateMetrics, AlloyGenerateEventClassification>('alloy.generate', {
			type
		});

	} catch (error) {
		if (error instanceof UserCancellation) {
			return;
		}
		window.showErrorMessage(`Failed to create Alloy ${type} ${name}`);
	}
}

export async function generateModel (): Promise<void> {
	let name;
	try {
		const creationArgs = await promptForDetails(AlloyComponentType.Model, AlloyComponentFolder.Model, AlloyComponentExtension.Model);
		const adapterType = await quickPick([ { id: 'properties', label: 'properties' }, { id: 'sql', label: 'sql' } ], { canPickMany: false, placeHolder: 'Which adapter type?' });
		const cwd = creationArgs.cwd;
		const filePaths = creationArgs.filePaths;
		name = creationArgs.name;
		await appc.generate({
			adapterType: adapterType.id,
			cwd,
			type: AlloyComponentType.Model,
			name,
			force: true
		});
		const shouldOpen = await window.showInformationMessage(`${capitalizeFirstLetter(AlloyComponentType.Model)} ${name} created successfully`, { title: 'Open' });
		if (shouldOpen) {
			for (const file of filePaths) {
				const document = await workspace.openTextDocument(file);
				await window.showTextDocument(document);
			}
		}

		ExtensionContainer.publicLog2<AlloyGenerateMetrics, AlloyGenerateEventClassification>('alloy.generate', {
			type: 'model'
		});

	} catch (error) {
		if (error instanceof UserCancellation) {
			return;
		}
		window.showErrorMessage(`Failed to create Alloy ${AlloyComponentType.Model} ${name}`);
	}
}
