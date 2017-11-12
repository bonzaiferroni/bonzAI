import {Operation, OperationPriorityMap} from "./ai/operations/Operation";
import {initPrototypes} from "./prototypes/initPrototypes";
import {Tick} from "./Tick";
import {OperationFactory} from "./ai/operations/OperationFactory";
import {Core} from "./ai/Empire";
import {Profiler} from "./Profiler";
import {Patcher} from "./Patcher";
import {TimeoutTracker} from "./TimeoutTracker";
import {consoleCommands} from "./helpers/consoleCommands";
import {sandBox} from "./sandbox";
import {GrafanaStats} from "./helpers/GrafanaStats";
import {Notifier} from "./notifier";
import {Scheduler} from "./Scheduler";

export class BonzAI {
    private static operations: OperationPriorityMap;
    private static empire: Core;

    /**
     * init phase - initialize core and instantiate operations
     */

    public static init() {
        try {
            if (this.empire && Object.keys(this.empire.spawnGroups).length > 0) {
                return;
            }

            this.empire = Core.get();
            OperationFactory.init();

            Tick.init();
            initPrototypes();

            this.empire.init();
            this.empire.update(true);

        } catch (e) { console.log("error during init phase:\n", e.stack); }
    }

    /**
     * update phase - update operations with game state
     */

    public static update() {
        try {
            Tick.refresh();
            // profile memory parsing
            let cpu = Game.cpu.getUsed();
            if (Memory) { }
            let result = Game.cpu.getUsed() - cpu;
            Profiler.resultOnly("mem", result);

            // reinitialize if flagcount is different (new operations might have been placed)
            this.operations = OperationFactory.getOperations();
            OperationFactory.bootstrapOperations();

            // patch memory or game state from earlier versions of bonzAI
            if (Patcher.checkPatch()) { return; }

            // init utilities
            TimeoutTracker.init();
            global.cc = consoleCommands;

            this.empire.update();
        } catch (e) { console.log("error initState phase:\n", e.stack); }

        Profiler.start("update");
        TimeoutTracker.log("update");
        Operation.update(this.operations);
        Profiler.end("update");
    }

    /**
     * roleCall phase - Find creeps belonging to missions and spawn any additional needed
     */

    public static roleCall() {
        TimeoutTracker.log("roleCall");
        Profiler.start("roleCall");
        Operation.roleCall(this.operations);
        Profiler.end("roleCall");
    }

    /**
     * actions phase - Actions that change the game state are executed in this phase
     */

    public static actions() {
        TimeoutTracker.log("actions");
        Profiler.start("actions");
        Operation.actions(this.operations);
        Profiler.end("actions");
    }

    /**
     * finalize phase - Code that needs to run post-actions phase
     */

    public static finalize() {
        TimeoutTracker.log("finalize");
        Profiler.start("finalize");
        Operation.finalize(this.operations);
        Profiler.end("finalize");

        // invalidate phase - happens once very 100 ticks on average, garbage collection and misc
        Operation.invalidateCache(this.operations);
    }

    /**
     * post-operation actions and utilities
     */

    public static postOperations() {
        try {

            if (Tick.cache.exceptionCount > 0) {
                console.log(`Exceptions this tick: ${Tick.cache.exceptionCount}`);
            }

            if (Tick.cache.bypassCount > 0) {
                console.log(`BYPASS: ${Tick.cache.bypassCount}`);
            }

            Profiler.start("postOperations");
            sandBox.run();
            Profiler.end("postOperations");
            GrafanaStats.run(this.empire);
            this.empire.finalize();
            Notifier.finalize();
            Profiler.finalize(); // needs to run near end of tick
            Scheduler.finalize(); // runs passive processes while cpu is under limit, need to run after profiler
            TimeoutTracker.finalize(); // need to run last
        } catch (e) { console.log("error during post-operations phase\n", e.stack); }
    }
}
