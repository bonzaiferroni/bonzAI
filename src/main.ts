import {loopHelper} from "./helpers/loopHelper";
import {initPrototypes} from "./prototypes/initPrototypes";
import {sandBox} from "./sandbox";
import {profiler} from "./profiler";

loopHelper.initMemory();
initPrototypes();

module.exports.loop = function () {
    Game.cache = { structures: {}, hostiles: {}, hostilesAndLairs: {}, mineralCount: {}, labProcesses: {},
        activeLabCount: 0, placedRoad: false };

    // Init phase - Information is gathered about the game state and game objects instantiated
    profiler.start("init");
    let empire = loopHelper.initEmpire();
    let operations = loopHelper.getOperations(empire);
    for (let operation of operations) operation.init();
    profiler.end("init");

    // RoleCall phase - Find creeps belonging to missions and spawn any additional needed.
    profiler.start("roleCall");
    for (let operation of operations) operation.roleCall();
    profiler.end("roleCall");

    // Actions phase - Actions that change the game state are executed in this phase.
    profiler.start("actions");
    for (let operation of operations) operation.actions();
    profiler.end("actions");

    // Finalize phase - Code that needs to run post-actions phase
    for (let operation of operations) operation.invalidateCache();
    profiler.start("finalize");
    for (let operation of operations) operation.finalize();
    profiler.end("finalize");

    // post-operation actions and utilities
    profiler.start("postOperations");
    try { empire.actions(); } catch (e) { console.log("error with empire actions\n", e.stack); }
    try { loopHelper.scavangeResources(); } catch (e) { console.log("error scavanging:\n", e.stack); }
    try { loopHelper.sendResourceOrder(empire); } catch (e) { console.log("error reporting transactions:\n", e.stack); }
    try { loopHelper.reportTransactions(); } catch (e) { console.log("error reporting transactions:\n", e.stack); }
    try { loopHelper.initConsoleCommands(); } catch (e) { console.log("error loading console commands:\n", e.stack); }
    try { sandBox.run(); } catch (e) { console.log("error loading sandbox:\n", e.stack ); }
    profiler.end("postOperations");
    try { loopHelper.grafanaStats(empire); } catch (e) { console.log("error reporting stats:\n", e.stack); }
    try { profiler.finalize(); } catch (e) { console.log("error checking profiler:\n", e.stack); }
};

