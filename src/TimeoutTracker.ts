import {notifier} from "./notifier";
export class TimeoutTracker {
    public static init() {
        if (global.timeoutTracker && global.timeoutTracker.phase !== "finished") {
            let data = global.timeoutTracker;
            notifier.log(`TIMEOUT: operation: ${data.operation}, mission: ${data.mission}, phase: ${data.phase}, ` +
                `function: ${data.func}, tick: ${data.tick}, current: ${Game.time}`);
            delete global.timeoutTracker;
        }

        global.timeoutTracker = {
            phase: "pre-operation init",
            operation: undefined,
            mission: undefined,
            func: undefined,
            tick: Game.time,
        };
    }

    public static log(phase: string, operation?: string, mission?: string, func?: string) {
        global.timeoutTracker.operation = operation;
        global.timeoutTracker.mission = mission;
        global.timeoutTracker.phase = phase;
        global.timeoutTracker.func = func;
    }

    public static finalize() {
        global.timeoutTracker.phase = "finished";
    }
}

interface TimeoutData {
    phase: string,
    operation?: string,
    mission?: string,
    func?: string,
}