"use strict";
const loopHelper_1 = require("./helpers/loopHelper");
const initPrototypes_1 = require("./prototypes/initPrototypes");
const sandbox_1 = require("./sandbox");
const profiler_1 = require("./profiler");
loopHelper_1.loopHelper.initMemory();
initPrototypes_1.initPrototypes();
module.exports.loop = function () {
    Game.cache = { structures: {}, hostiles: {}, hostilesAndLairs: {}, mineralCount: {}, labProcesses: {},
        activeLabCount: 0, placedRoad: false };
    // Init phase - Information is gathered about the game state and game objects instantiated
    profiler_1.profiler.start("init");
    let empire = loopHelper_1.loopHelper.initEmpire();
    let operations = loopHelper_1.loopHelper.getOperations(empire);
    for (let operation of operations)
        operation.init();
    profiler_1.profiler.end("init");
    // RoleCall phase - Find creeps belonging to missions and spawn any additional needed.
    profiler_1.profiler.start("roleCall");
    for (let operation of operations)
        operation.roleCall();
    profiler_1.profiler.end("roleCall");
    // Actions phase - Actions that change the game state are executed in this phase.
    profiler_1.profiler.start("actions");
    for (let operation of operations)
        operation.actions();
    profiler_1.profiler.end("actions");
    // Finalize phase - Code that needs to run post-actions phase
    for (let operation of operations)
        operation.invalidateCache();
    profiler_1.profiler.start("finalize");
    for (let operation of operations)
        operation.finalize();
    profiler_1.profiler.end("finalize");
    // post-operation actions and utilities
    profiler_1.profiler.start("postOperations");
    try {
        empire.actions();
    }
    catch (e) {
        console.log("error with empire actions\n", e.stack);
    }
    try {
        loopHelper_1.loopHelper.scavangeResources();
    }
    catch (e) {
        console.log("error scavanging:\n", e.stack);
    }
    try {
        loopHelper_1.loopHelper.sendResourceOrder(empire);
    }
    catch (e) {
        console.log("error reporting transactions:\n", e.stack);
    }
    try {
        loopHelper_1.loopHelper.reportTransactions();
    }
    catch (e) {
        console.log("error reporting transactions:\n", e.stack);
    }
    try {
        loopHelper_1.loopHelper.initConsoleCommands();
    }
    catch (e) {
        console.log("error loading console commands:\n", e.stack);
    }
    try {
        sandbox_1.sandBox.run();
    }
    catch (e) {
        console.log("error loading sandbox:\n", e.stack);
    }
    profiler_1.profiler.end("postOperations");
    try {
        loopHelper_1.loopHelper.grafanaStats(empire);
    }
    catch (e) {
        console.log("error reporting stats:\n", e.stack);
    }
    try {
        loopHelper_1.loopHelper.profilerCheck();
    }
    catch (e) {
        console.log("error checking profiler:\n", e.stack);
    }
};
