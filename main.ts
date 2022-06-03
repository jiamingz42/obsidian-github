import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import * as internal from 'stream';

import "./colorize";
import type codemirror from "codemirror";
import Prism from 'prismjs';

const base64 = require('base-64');
const { Octokit } = require("@octokit/core");
const octokit = new Octokit({
	auth: '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'
})





// Remember to rename these classes and interfaces!

interface ObsidianGithubSettings {
	githubPat: string;
	owner: string;
	repo: string;
	maxLinesShown: number;
}

const DEFAULT_SETTINGS: ObsidianGithubSettings = {
	githubPat: 'default',
	owner: '',
	repo: '',
	maxLinesShown: 20
}

export default class ObsidianGithub extends Plugin {
	settings: ObsidianGithubSettings;

	async onload() {
		await this.loadSettings();

		// // This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// // This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// // This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianGithubSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor(
			`github`,
			(src, el, ctx) => this.postprocessor(src, el, ctx)
		)

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async fetchFileContent(owner: string, repo: string, path: string) {
		const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: this.settings.owner,
			repo: this.settings.repo,
			path: path
		})
		return base64.decode(response['data']['content']);
	}

	parseSource(src: string): GithubFileContent {
		const { owner, repo } = this.settings;
		const match = src.trim().match(/^(.*)#L(\d+)(-L(\d+))?$/);
		if (match) {
			const [_, path, lineStartString, _2, lineEndString] = match;
			const lineStart = parseInt(lineStartString);
			const lineEnd = lineEndString === undefined ? undefined : parseInt(lineEndString);
			return {
				owner: owner,
				repo: repo,
				path: path,
				lineStart: lineStart,
				lineEnd: lineEnd
			}
		}

		return {
			owner: owner,
			repo: repo,
			path: src.trim(),

		}
	}

	getShortFilename(fullFilename: string): string {
		return fullFilename.split('\/').slice(-1)[0];
	}

	// Show [lineStart, lineEnd] inclusively. Line start from 1.
	getFilecontentByLines(fullContent: string, lineStart?: number, lineEnd?: number): string {
		const lines = fullContent.split('\n');

		const finalLineStart = lineStart === undefined ? 1 : lineStart;
		const finalLineEnd = lineEnd === undefined ? Math.min(finalLineStart + this.settings.maxLinesShown - 1, lines.length) : lineEnd;

		return lines.slice(finalLineStart - 1, finalLineEnd).join('\n');
	}

	getLangageCls(path: string): string {
		if (path.endsWith('.js')) {
			return "language-javascript";
		} else if (path.endsWith('.ex')) {
			return "language-elixir";
		} else if (path.endsWith('.py')) {
			return "language-python";
		} else {
			return ""
		}
	}

	createCodeFromString(fileContent: string): Node {
		// TODO: How to load more language
		const template  = createEl('template');
		const html = Prism.highlight(fileContent, Prism.languages.javascript, 'javascript');
		template.innerHTML = `<code>${html}</code>`;
		return template.content.firstChild;
	}

	async postprocessor(
		src: string,
		el: HTMLElement,
		ctx?: MarkdownPostProcessorContext
	) {
		const { owner, repo, path, lineStart, lineEnd } = this.parseSource(src);
		const fileContent = await this.fetchFileContent(owner, repo, path);
		const visibleContent = this.getFilecontentByLines(fileContent, lineStart, lineEnd);

		const clsPrefix = 'obsidian-github'

		const topLevelDiv = createEl("div", {
			cls: `${clsPrefix}-main`,
			attr: {
				style: "border-left: 3px solid #00000087; padding-left: 10px; margin-bottom: 10px"
			}
		});

		const header = topLevelDiv.createEl("div", { cls: `${clsPrefix}-header` });
		header.createEl("a", {
			text: this.getShortFilename(path),
			attr: {
				href: `https://github.com/${owner}/${repo}/blob/main/${path}`
			}
		});

		const code = topLevelDiv
			.createEl("pre", {})
			.createEl("code", {
				cls: this.getLangageCls(path),
				attr: {}
			});
		code.replaceWith(this.createCodeFromString(fileContent));

		const footer = topLevelDiv.createEl("div", { cls: `${clsPrefix}-footer`});
		const button = footer.createEl("button", {
			text: "Copy Path",
			cls: "obsidian-github-copy-path",
			attr: {
				style: "font-size: 10px; padding-left: 10px; padding-right: 10px",
				"data-path": path,
			}
		});
		button.addEventListener("click", (evt) => {
			const srcElement = evt.srcElement;
			const path = srcElement.dataset['path'];
			navigator.clipboard.writeText(path).then(async () => {
				new Notice("Copied to clipboard.");
			});
		});


		el.replaceWith(topLevelDiv);
	}


	refreshPanes() {
		this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
			if (leaf.view instanceof MarkdownView) {
				leaf.view.previewMode.rerender(true);
			}
		});
	}
}

interface GithubFileContent {
	owner: string;
	repo: string;
	path: string;
	lineStart?: number;
	lineEnd?: number;
}


class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ObsidianGithubSettingTab extends PluginSettingTab {
	plugin: ObsidianGithub;

	constructor(app: App, plugin: ObsidianGithub) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian Github Settings' });

		new Setting(containerEl)
			.setName('Github Personal Access Token')
			// .setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.githubPat)
				.onChange(async (value) => {
					this.plugin.settings.githubPat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Owner')
			.addText(text => text
				.setPlaceholder('Enter your default owner')
				.setValue(this.plugin.settings.owner)
				.onChange(async (value) => {
					this.plugin.settings.owner = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Repo')
			.addText(text => text
				.setPlaceholder('Enter your default repo')
				.setValue(this.plugin.settings.repo)
				.onChange(async (value) => {
					this.plugin.settings.repo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max Lines Shown')
			.addText(text => text
				.setPlaceholder('Enter max lines shown')
				.setValue(this.plugin.settings.maxLinesShown.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxLinesShown = parseInt(value);
					await this.plugin.saveSettings();
				}));
	}
}






