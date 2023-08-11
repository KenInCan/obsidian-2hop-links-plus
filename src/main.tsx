import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import React from "react";
import ReactDOM from "react-dom";
import { FileEntity } from "./model/FileEntity";
import { TwohopLink } from "./model/TwohopLink";
import TwohopLinksRootView from "./ui/TwohopLinksRootView";
import { TagLinks } from "./model/TagLinks";
import { removeBlockReference } from "./utils";
import {
  TwohopPluginSettings,
  TwohopSettingTab,
} from "./settings/TwohopSettingTab";
import { SeparatePaneView } from "./ui/SeparatePaneView";
import { readPreview } from "./preview";
import { loadSettings } from "./settings/index";
import { gatherTwoHopLinks } from "./linkLogic";

const CONTAINER_CLASS = "twohop-links-container";
export const HOVER_LINK_ID = "2hop-links";

declare module "obsidian" {
  interface Workspace {
    on(eventName: "layout-ready", callback: () => any, ctx?: any): EventRef;
  }
}

export default class TwohopLinksPlugin extends Plugin {
  settings: TwohopPluginSettings;
  showLinksInMarkdown: boolean;

  private previousLinks: string[] = [];
  private previousTags: string[] = [];

  async onload(): Promise<void> {
    console.debug("------ loading obsidian-twohop-links plugin");

    this.settings = await loadSettings(this);
    this.showLinksInMarkdown = true;

    this.initPlugin();
  }

  async initPlugin() {
    this.addSettingTab(new TwohopSettingTab(this.app, this));
    this.registerView(
      "TwoHopLinksView",
      (leaf: WorkspaceLeaf) => new SeparatePaneView(leaf, this)
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", async (file: TFile) => {
        if (file === this.app.workspace.getActiveFile()) {
          await this.renderTwohopLinks(false);
        }
      })
    );
    this.app.workspace.on("file-open", this.refreshTwohopLinks.bind(this));
    this.app.workspace.trigger("parse-style-settings");

    await this.renderTwohopLinks(true);
    if (this.app.workspace.layoutReady) {
      this.updateTwoHopLinksView();
    } else {
      this.registerEvent(
        this.app.workspace.on(
          "layout-ready",
          this.updateTwoHopLinksView.bind(this)
        )
      );
    }
  }

  onunload(): void {
    this.cleanupPlugin();
    console.log("unloading plugin");
  }

  cleanupPlugin() {
    this.disableLinksInMarkdown();
    this.closeTwoHopLinksView();
  }

  async refreshTwohopLinks() {
    if (this.showLinksInMarkdown) {
      await this.renderTwohopLinks(true);
    }
  }

  private async openFile(fileEntity: FileEntity): Promise<void> {
    const linkText = removeBlockReference(fileEntity.linkText);

    console.debug(
      `Open file: linkText='${linkText}', sourcePath='${fileEntity.sourcePath}'`
    );
    const file = this.app.metadataCache.getFirstLinkpathDest(
      linkText,
      fileEntity.sourcePath
    );
    if (file == null) {
      if (!confirm(`Create new file: ${linkText}?`)) {
        console.log("Canceled!!");
        return;
      }
    }
    return this.app.workspace.openLinkText(
      fileEntity.linkText,
      fileEntity.sourcePath
    );
  }

  async updateTwoHopLinksView() {
    if (this.isTwoHopLinksViewOpen()) {
      this.closeTwoHopLinksView();
    }
    if (this.settings.showTwoHopLinksInSeparatePane) {
      this.openTwoHopLinksView();
      this.disableLinksInMarkdown();
    } else {
      this.enableLinksInMarkdown();
    }
  }

  async updateOpenTwoHopLinksView() {
    for (let leaf of this.app.workspace.getLeavesOfType("TwoHopLinksView")) {
      let view = leaf.view;
      if (view instanceof SeparatePaneView) {
        await view.onOpen();
      }
    }
  }

  isTwoHopLinksViewOpen(): boolean {
    return this.app.workspace.getLeavesOfType("TwoHopLinksView").length > 0;
  }

  async openTwoHopLinksView() {
    const leaf = this.settings.panePositionIsRight
      ? this.app.workspace.getRightLeaf(false)
      : this.app.workspace.getLeftLeaf(false);
    leaf.setViewState({ type: "TwoHopLinksView" });
    this.app.workspace.revealLeaf(leaf);
  }

  closeTwoHopLinksView() {
    this.app.workspace.detachLeavesOfType("TwoHopLinksView");
  }

  private getContainerElements(markdownView: MarkdownView): Element[] {
    const elements = markdownView.containerEl.querySelectorAll(
      ".markdown-source-view .CodeMirror-lines, .markdown-preview-view, .markdown-source-view .cm-sizer"
    );

    const containers: Element[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements.item(i);
      const container =
        el.querySelector("." + CONTAINER_CLASS) ||
        el.createDiv({ cls: CONTAINER_CLASS });
      containers.push(container);
    }

    return containers;
  }

  private getActiveFileLinks(file: TFile | null): string[] {
    if (!file) {
      return [];
    }

    const cache = this.app.metadataCache.getFileCache(file);
    return cache && cache.links ? cache.links.map((link) => link.link) : [];
  }

  private getActiveFileTags(file: TFile | null): string[] {
    if (!file) {
      return [];
    }

    const cache = this.app.metadataCache.getFileCache(file);

    let tags = cache && cache.tags ? cache.tags.map((tag) => tag.tag) : [];

    if (cache && cache.frontmatter && cache.frontmatter.tags) {
      if (typeof cache.frontmatter.tags === "string") {
        tags.push(cache.frontmatter.tags);
      } else if (Array.isArray(cache.frontmatter.tags)) {
        tags = tags.concat(cache.frontmatter.tags);
      }
    }

    return tags;
  }

  async renderTwohopLinks(isForceUpdate: boolean): Promise<void> {
    if (this.settings.showTwoHopLinksInSeparatePane) {
      return;
    }
    const markdownView: MarkdownView =
      this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = markdownView?.file;
    if (activeFile === null) {
      console.error("No active file");
      return;
    }

    const currentLinks = this.getActiveFileLinks(activeFile);
    const currentTags = this.getActiveFileTags(activeFile);

    if (
      isForceUpdate ||
      this.previousLinks.sort().join(",") !== currentLinks.sort().join(",") ||
      this.previousTags.sort().join(",") !== currentTags.sort().join(",") ||
      activeFile === null
    ) {
      const {
        forwardLinks,
        newLinks,
        backwardLinks,
        twoHopLinks,
        tagLinksList,
      } = await gatherTwoHopLinks(this.settings, activeFile);

      for (const container of this.getContainerElements(markdownView)) {
        await this.injectTwohopLinks(
          forwardLinks,
          newLinks,
          backwardLinks,
          twoHopLinks,
          tagLinksList,
          container
        );
      }

      this.previousLinks = currentLinks;
      this.previousTags = currentTags;
    }
  }

  async injectTwohopLinks(
    forwardConnectedLinks: FileEntity[],
    newLinks: FileEntity[],
    backwardConnectedLinks: FileEntity[],
    twoHopLinks: TwohopLink[],
    tagLinksList: TagLinks[],
    container: Element
  ) {
    const showForwardConnectedLinks = this.settings.showForwardConnectedLinks;
    const showBackwardConnectedLinks = this.settings.showBackwardConnectedLinks;
    ReactDOM.render(
      <TwohopLinksRootView
        forwardConnectedLinks={forwardConnectedLinks}
        newLinks={newLinks}
        backwardConnectedLinks={backwardConnectedLinks}
        twoHopLinks={twoHopLinks}
        tagLinksList={tagLinksList}
        onClick={this.openFile.bind(this)}
        getPreview={readPreview.bind(this)}
        app={this.app}
        showForwardConnectedLinks={showForwardConnectedLinks}
        showBackwardConnectedLinks={showBackwardConnectedLinks}
        autoLoadTwoHopLinks={this.settings.autoLoadTwoHopLinks}
        initialBoxCount={this.settings.initialBoxCount}
        initialSectionCount={this.settings.initialSectionCount}
      />,
      container
    );
  }

  enableLinksInMarkdown(): void {
    this.showLinksInMarkdown = true;
    this.renderTwohopLinks(true).then(() =>
      console.debug("Rendered two hop links")
    );
  }

  disableLinksInMarkdown(): void {
    this.showLinksInMarkdown = false;
    this.removeTwohopLinks();
    const container = this.app.workspace.containerEl.querySelector(
      ".twohop-links-container"
    );
    if (container) {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
    }
    (this.app.workspace as any).unregisterHoverLinkSource(HOVER_LINK_ID);
  }

  removeTwohopLinks(): void {
    const markdownView: MarkdownView =
      this.app.workspace.getActiveViewOfType(MarkdownView);

    if (markdownView !== null) {
      for (const element of this.getContainerElements(markdownView)) {
        const container = element.querySelector("." + CONTAINER_CLASS);
        if (container) {
          container.remove();
        }
      }

      if (markdownView.previewMode !== null) {
        const previewElements = Array.from(
          markdownView.previewMode.containerEl.querySelectorAll(
            "." + CONTAINER_CLASS
          )
        );
        for (const element of previewElements) {
          element.remove();
        }
      }
    }
  }
}
