import { Type } from "typebox";
import * as commands from "@/lib/tauri/commands";
import { defineTool, type ToolSpec } from "./categories";

// ============================================================================
// Parameter Schemas
// ============================================================================

const ReadFileParams = Type.Object({
  path: Type.String({ description: "Path to the file to read" }),
});

const WriteFileParams = Type.Object({
  path: Type.String({ description: "Path to write the file" }),
  content: Type.String({ description: "Content to write" }),
});

const DeletePathParams = Type.Object({
  path: Type.String({ description: "Path to delete (file or directory)" }),
});

const CreateDirectoryParams = Type.Object({
  path: Type.String({ description: "Path to the directory to create" }),
});

const ReadDirectoryParams = Type.Object({
  path: Type.String({ description: "Path to the directory to read" }),
  max_depth: Type.Optional(
    Type.Number({ description: "Maximum depth to recurse (default: 3)" })
  ),
});

const PathExistsParams = Type.Object({
  path: Type.String({ description: "Path to check" }),
});

const ListFilesParams = Type.Object({
  dir: Type.String({ description: "Directory to list files from" }),
  extension: Type.Optional(
    Type.String({ description: "Filter by file extension (e.g., 'md', 'yaml')" })
  ),
});

const RenamePathParams = Type.Object({
  old_path: Type.String({ description: "Current path" }),
  new_path: Type.String({ description: "New path" }),
});

// ============================================================================
// Tool Specs
// ============================================================================

export const FS_TOOLS: ToolSpec[] = [
  defineTool({
    name: "read_file",
    description: "Read the contents of a file at the specified path",
    parameters: ReadFileParams,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    pathParams: ["path"],
    execute: ({ path }) => commands.readFile(path),
  }),
  defineTool({
    name: "write_file",
    description: "Write content to a file, creating parent directories if needed",
    parameters: WriteFileParams,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    pathParams: ["path"],
    execute: async ({ path, content }, ctx) => {
      await commands.writeFile(path, content);
      return ctx.withResolutionNotes(`Successfully wrote to ${path}`);
    },
  }),
  defineTool({
    name: "delete_path",
    description: "Delete a file or directory at the specified path",
    parameters: DeletePathParams,
    category: "file_system",
    riskLevel: "high",
    supportsUndo: true,
    pathParams: ["path"],
    execute: async ({ path }, ctx) => {
      await commands.deletePath(path);
      return ctx.withResolutionNotes(`Successfully deleted ${path}`);
    },
  }),
  defineTool({
    name: "create_directory",
    description: "Create a directory at the specified path, including parent directories",
    parameters: CreateDirectoryParams,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    pathParams: ["path"],
    execute: async ({ path }, ctx) => {
      await commands.createDirectory(path);
      return ctx.withResolutionNotes(`Successfully created directory ${path}`);
    },
  }),
  defineTool({
    name: "read_directory",
    description: "Read the contents of a directory recursively up to a max depth",
    parameters: ReadDirectoryParams,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    pathParams: ["path"],
    execute: async ({ path, max_depth }) => {
      const nodes = await commands.readDirectory(path, max_depth);
      return JSON.stringify(nodes, null, 2);
    },
  }),
  defineTool({
    name: "path_exists",
    description: "Check if a file or directory exists at the specified path",
    parameters: PathExistsParams,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    pathParams: ["path"],
    execute: async ({ path }, ctx) => {
      const exists = await commands.pathExists(path);
      return ctx.withResolutionNotes(
        exists ? `Path exists: ${path}` : `Path does not exist: ${path}`
      );
    },
  }),
  defineTool({
    name: "list_files",
    description: "List files in a directory, optionally filtered by extension",
    parameters: ListFilesParams,
    category: "file_system",
    riskLevel: "low",
    supportsUndo: false,
    pathParams: ["dir"],
    execute: async ({ dir, extension }) => {
      const files = await commands.listFiles(dir, extension);
      return files.join("\n");
    },
  }),
  defineTool({
    name: "rename_path",
    description: "Rename or move a file or directory from old_path to new_path",
    parameters: RenamePathParams,
    category: "file_system",
    riskLevel: "medium",
    supportsUndo: true,
    pathParams: ["old_path", "new_path"],
    execute: async ({ old_path, new_path }, ctx) => {
      await commands.renamePath(old_path, new_path);
      return ctx.withResolutionNotes(`Successfully renamed ${old_path} to ${new_path}`);
    },
  }),
];
