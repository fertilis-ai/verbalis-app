// Storage for the app data directory (~/.verbalis on desktop, a localStorage
// virtual file system in the browser). Import from "@/lib/storage"; the
// sub-modules import each other directly.

export {
  getAppDataDir,
  initAppDataDir,
  readDirectory,
  readFile,
  writeFile,
  deletePath,
  createDirectory,
  pathExists,
  listFiles,
  renamePath,
  isTauri,
} from "./fs";
export type {
  FileNode,
} from "./fs";
export {
  saveFolderMeta,
  loadFolderMeta,
} from "./tree";
export type {
  FolderMeta,
  ChatFolderMeta,
  SchedulerFolderMeta,
} from "./tree";
export {
  loadChatByPath,
  createChatFolder,
  saveChatToFolder,
  loadChatTree,
  deleteChatByPath,
  deleteChatFolder,
  renameChat,
  renameChatFolder,
  toggleChatFolderPin,
} from "./chats";
export type {
  ChatTreeNode,
  ChatData,
} from "./chats";
export {
  saveAgent,
  loadAgent,
  listAgents,
  deleteAgent,
} from "./agents";
export {
  loadTaskTree,
  createTaskFolder,
  saveTaskFolder,
  loadTaskFolder,
  deleteTaskFolder,
  renameTaskFolder,
  toggleTaskFolderPin,
} from "./tasks";
export type {
  TaskResultStatus,
  TaskStage,
  TaskData,
  TaskFolderData,
  TaskTreeNode,
} from "./tasks";
export {
  loadSchedulerTree,
  loadSchedulerFolderMeta,
  saveSchedulerFolderMeta,
  createSchedulerFolder,
  saveSchedule,
  loadSchedule,
  deleteScheduleByPath,
  deleteSchedulerFolder,
  renameSchedulerFolder,
  toggleSchedulerFolderPin,
} from "./scheduler";
export type {
  ScheduleData,
  SchedulerTreeNode,
} from "./scheduler";
export {
  saveToolboxItem,
  loadToolboxItem,
  listToolboxItems,
  deleteToolboxItem,
  renameToolboxItem,
} from "./toolbox";
export type {
  ToolboxItemData,
} from "./toolbox";
export {
  ensureWellKnownMemories,
  ensureDefaultToolboxItems,
} from "./defaults";
