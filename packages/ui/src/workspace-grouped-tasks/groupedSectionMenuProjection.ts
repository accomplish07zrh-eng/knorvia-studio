// SPDX-License-Identifier: Apache-2.0
// Source-exposed positional menu/identity projection; source review and verification pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { TaskGroupMenuItem } from "./types.js";

/** One traversal; menu values and id positions independently retain their previous array. */
export class GroupedSectionMenuProjection {
  private menus: TaskGroupMenuItem[] = [];
  private ids: string[] = [];

  project(view: KnorviaGroupedTaskView): { menus: TaskGroupMenuItem[]; ids: string[] } {
    const menus: TaskGroupMenuItem[] = [], ids: string[] = [];
    let sameMenus = true, sameIds = true;
    for (const node of view.nodes) {
      if (node.type !== "group") continue;
      const ordinal = ids.length, group = node.group, previous = this.menus[ordinal];
      const menu = { id: group.id, title: group.title, color: group.color };
      sameIds = sameIds && this.ids[ordinal] === menu.id;
      sameMenus = sameMenus && previous !== undefined && previous.id === menu.id && previous.title === menu.title && previous.color === menu.color;
      ids.push(menu.id);
      menus.push(menu);
    }
    if (!sameIds || ids.length !== this.ids.length) this.ids = ids;
    if (!sameMenus || menus.length !== this.menus.length) this.menus = menus;
    return { menus: this.menus, ids: this.ids };
  }
}
