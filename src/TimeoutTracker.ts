import {notifier} from "./notifier";
export class TimeoutTracker {
    public static init() {
        if (global.timeoutTracker && global.timeoutTracker.phase !== "finished") {
            let data = global.timeoutTracker;
            notifier.log(`TIMEOUT: operation: ${data.operation}, mission: ${data.mission}, phase: ${data.phase}`);
            delete global.timeoutTracker;
        }

        global.timeoutTracker = { phase: "pre-operation init", operation: undefined, mission: undefined };
    }

    public static log(phase: string, operation?: string, mission?: string) {
        global.timeoutTracker.operation = operation;
        global.timeoutTracker.mission = mission;
        global.timeoutTracker.phase = phase;
    }

    public static finalize() {
        global.timeoutTracker.phase = "finished";
    }
}