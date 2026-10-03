// SPDX-License-Identifier: Apache-2.0
// Preserve public consumer paths; source-exposed candidate, review remains pending.
export {
  areAllGroupedTaskGroupsExpanded,
  cloneView,
  filterGroupedViewByTaskKeys,
  findTaskInGroupedView,
  getGroupedTaskGroupIds,
  pruneCollapsedGroupedTaskGroupIds,
  removeTaskFromGroupedView,
  replaceTaskInGroupedView,
  resolveGroupedDraftTaskPlacementForTask,
} from "@/workspace-grouped-tasks/viewSelectors.js";
export {
  moveTaskByMenu,
  moveGroupAroundTopLevelNode,
  moveTaskToTopByMenu,
  moveTaskToGroupEnd,
  moveTaskToGroupStart,
  moveTaskToRootAroundGroup,
  moveTaskOverTask,
} from "@/workspace-grouped-tasks/viewCommands.js";
export type { GroupedTaskInsertPosition } from "@/workspace-grouped-tasks/viewCommands.js";
