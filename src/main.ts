import {loopHelper} from "./loopHelper";
import {initPrototypes} from "./initPrototypes";
import {sandBox} from "./sandbox";
import {profiler} from "./profiler";

loopHelper.initMemory();
initPrototypes();

module.exports.loop = function () {
    Game.cache = { structures: {}, hostiles: {}, hostilesAndLairs: {}, mineralCount: {}, labProcesses: {}, activeLabCount: 0 };
    profiler.start("init");
    // just an empty object for now, eventually have data and functions related to your entire empire
    let empire = loopHelper.initEmpire();
    // loop through flags and construct operation objects, return operation array sorted by priority
    let operations = loopHelper.getOperations(empire);
    // initOperation is used for finding a spawn and other variables necessary to inform spawning/roleCall
    for (let operation of operations) operation.init();
    // initOperation is used for finding a spawn and other variables necessary to inform spawning/roleCall
    for (let operation of operations) operation.initMissions();
    profiler.end("init");
    // see which creeps are already spawned and spawn more if necessary
    profiler.start("roleCall");
    for (let operation of operations) operation.roleCall();
    profiler.end("roleCall");
    // execute functions on operation structures (terminals, labs, towers, etc) and creeps (harvest, moveTo, etc.)
    profiler.start("actions");
    for (let operation of operations) operation.actions();
    profiler.end("actions");
    // invalidate cache during invalidation period
    for (let operation of operations) operation.invalidateCache();
    profiler.start("finalize");
    // finalize up any remaining processes that need to called after creep actions
    for (let operation of operations) operation.finalize();
    profiler.end("finalize");

    // utilities
    profiler.start("postOperations");
    try { empire.actions(); } catch (e) { console.log("error with empire actions\n", e.stack); }
    try { loopHelper.scavangeResources(); } catch (e) { console.log("error scavanging:\n", e.stack); }
    try { loopHelper.sendResourceOrder(empire); } catch (e) { console.log("error reporting transactions:\n", e.stack); }
    try { loopHelper.reportTransactions(); } catch (e) { console.log("error reporting transactions:\n", e.stack); }
    try { loopHelper.initConsoleCommands(); } catch (e) { console.log("error loading console commands:\n", e.stack); }
    try { sandBox.run(); } catch (e) { console.log("error loading sandbox:\n", e.stack ); }
    profiler.end("postOperations");
    try { loopHelper.grafanaStats(empire); } catch (e) { console.log("error reporting stats:\n", e.stack); }
    try { loopHelper.profilerCheck(); } catch (e) { console.log("error checking profiler:\n", e.stack); }
};

