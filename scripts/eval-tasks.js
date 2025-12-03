import { parseArgs, findTasks, createTaskInfoFolder, createTaskWorkspace } from './run-tasks.js';

async function runTask(_task) {
  // TODO: Implement task execution
}

async function copyResults(_task) {
  // TODO: Implement copying results to task info folder
}

async function cleanUp(_task) {
  // TODO: Implement workspace cleanup
}

async function evalTasks() {
  const args = parseArgs(process.argv);
  const tasks = await findTasks(args);
  
  // prepare task folders
  for (const task of tasks) {
    await createTaskInfoFolder(task);
    await createTaskWorkspace(task);
  }

  // run the tasks
  for (const task of tasks) {
    await runTask(task);
    await copyResults(task);
    await cleanUp(task);
  }
}

evalTasks();
