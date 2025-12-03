async function runTasks() {
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

runTasks();
