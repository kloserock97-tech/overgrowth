/* Types for panel.js: the same shape as the part of lil-gui the demos use. */

export function stageSize(): { width: number; height: number };

export interface Controller {
  parent: Folder;
  object: any;
  property: string;
  domElement: HTMLElement;
  name(text: string): this;
  onChange(callback: (value: any) => void): this;
  onFinishChange(callback: (value: any) => void): this;
  listen(on?: boolean): this;
  updateDisplay(): this;
  setValue(value: any): this;
  getValue(): any;
  show(on?: boolean): this;
  hide(): this;
  reset(): this;
  min(value: number): this;
  max(value: number): this;
  step(value: number): this;
  options(options: unknown[] | Record<string, unknown>): this;
}

export class Folder {
  parent: Folder | null;
  root: GUI;
  controllers: Controller[];
  folders: Folder[];
  add(object: object, property: string, min?: number | unknown[] | Record<string, unknown>, max?: number, step?: number): Controller;
  addColor(object: object, property: string): Controller;
  addFolder(title: string): Folder;
  title(text: string): this;
  controllersRecursive(): Controller[];
  open(): this;
  close(): this;
  show(on?: boolean): this;
  hide(): this;
}

export interface GUIOptions {
  /** the demo's name, used for the sheet's label */
  title?: string;
  /** the source link behind the GitHub button */
  repo?: string;
  /** shows the Reset button */
  onReset?: () => void;
  /** the name of the tab with the controls added to the root */
  rootTitle?: string;
  /** the theme on a first visit; the viewer's choice is remembered */
  theme?: "light" | "dark";
  /** open on start; by default open everywhere except phones */
  open?: boolean;
}

export default class GUI extends Folder {
  constructor(options?: GUIOptions);
  readonly _hidden: boolean;
  isOpen: boolean;
  setTheme(theme: "light" | "dark", remember?: boolean): void;
}
