export interface TaskPath {
  list: string;
  name: string;
}

/**
 * Parses the `list/name` addressing used by the `/tasks` commands.
 *
 * Name validation itself lives in TaskService, so this only enforces the two-segment shape.
 */
export function parseTaskPath(path: string): TaskPath {
  const segments = path.split("/");
  if (segments.length !== 2 || segments.some(segment => segment.trim() === "")) {
    throw new Error(`Invalid task path "${path}". Use the form list/name, for example: refactor/extract-parser`);
  }
  return { list: segments[0]!.trim(), name: segments[1]!.trim() };
}

export function formatTaskPath({ list, name }: TaskPath): string {
  return `${list}/${name}`;
}
