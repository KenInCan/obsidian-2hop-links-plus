import { App, PluginSettingTab, Setting } from "obsidian";
import TwohopLinksPlugin from "./main";

export interface TwohopPluginSettings {
  showForwardConnectedLinks: boolean;
  showBackwardConnectedLinks: boolean;
  putOnTop: boolean;
  showImage: boolean;
  excludePaths: string[];
}

export const DEFAULT_SETTINGS: TwohopPluginSettings = {
  showForwardConnectedLinks: true,
  showBackwardConnectedLinks: true,
  putOnTop: false,
  showImage: true,
  excludePaths: [],
};

export class TwohopSettingTab extends PluginSettingTab {
  plugin: TwohopLinksPlugin;

  constructor(app: App, plugin: TwohopLinksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const containerEl = this.containerEl;

    containerEl.empty();

    new Setting(containerEl).setName("Show links").addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.showForwardConnectedLinks)
        .onChange(async (value) => {
          this.plugin.settings.showForwardConnectedLinks = value;
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl).setName("Show back links").addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.showBackwardConnectedLinks)
        .onChange(async (value) => {
          this.plugin.settings.showBackwardConnectedLinks = value;
          await this.plugin.saveSettings();
        })
    );

    new Setting(containerEl)
      .setName("Put 2hop links to top of the pane(Experimental).")
      .setDesc(
        "Known bugs: This configuration doesn't work with the 'Embedded Note Titles' plugin."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.putOnTop)
          .onChange(async (value) => {
            this.plugin.settings.putOnTop = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show image in the 2hop links")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showImage)
          .onChange(async (value) => {
            this.plugin.settings.showImage = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Exclude paths")
      .setDesc("List of file or folder paths to exclude, one per line")
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder("path/to/file.md\npath/to/folder/")
          .setValue(this.plugin.settings.excludePaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value
              .split("\n")
              .map((path) => path.trim());
            await this.plugin.saveSettings();
          });
        textArea.inputEl.style.height = "150px";
      });
  }
}
