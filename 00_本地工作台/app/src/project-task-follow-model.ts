import type { ProjectManagementSnapshot, ProjectManagementTask } from "./types";
export type { ProjectTaskFollowState } from "./types";

export type AllProjectTodoGroup = {
  projectId: string;
  projectName: string;
  tasks: Array<ProjectManagementTask & { followKey: string | null; recentlyCompleted?: boolean }>;
};

export type RecentlyCompletedProjectTodo = {
  projectId: string;
  projectName: string;
  task: ProjectManagementTask;
};

export function projectTaskFollowKey(projectId: string | null, taskId: string) {
  if (!projectId || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(projectId)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(taskId)) return null;
  return `${projectId}:${taskId}`;
}

/** 保留事业注册表项目顺序，以及项目原件“正在做→下一步”的书写顺序。 */
export function buildAllProjectTodoGroups(snapshot?: ProjectManagementSnapshot): AllProjectTodoGroup[] {
  if (!snapshot) return [];
  return snapshot.projects.flatMap((project): AllProjectTodoGroup[] => {
    if (project.archived || !project.projectId || !project.management) return [];
    const tasks = [...project.management.doing, ...project.management.next]
      .filter((task) => !task.done && task.sourceKind === "project")
      .map((task) => ({
        ...task,
        followKey: task.idKind === "explicit" && task.writable
          ? projectTaskFollowKey(project.projectId, task.id)
          : null,
      }));
    return tasks.length ? [{ projectId: project.projectId, projectName: project.name, tasks }] : [];
  });
}

/** 只在当前“全部待办”展开会话中，把刚完成而从原列表消失的任务留在原项目位置。 */
export function retainRecentlyCompletedProjectTodos(
  groups: AllProjectTodoGroup[],
  retained: RecentlyCompletedProjectTodo[],
): AllProjectTodoGroup[] {
  if (!retained.length) return groups;
  const visibleKeys = new Set(groups.flatMap((group) => group.tasks.map((task) => `${group.projectId}:${task.id}`)));
  const next = groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
  for (const item of retained) {
    const key = `${item.projectId}:${item.task.id}`;
    if (visibleKeys.has(key)) continue;
    const task = { ...item.task, done: true, followKey: null, recentlyCompleted: true };
    const group = next.find((candidate) => candidate.projectId === item.projectId);
    if (group) group.tasks.push(task);
    else next.push({ projectId: item.projectId, projectName: item.projectName, tasks: [task] });
    visibleKeys.add(key);
  }
  return next;
}
