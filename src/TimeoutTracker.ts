import {notifier} from "./notifier";
export class TimeoutTracker {
    public static init() {
        if (Memory.timeoutTracker) {
            let data = Memory.timeoutTracker;
            notifier.log(`TIMEOUT: operation: ${data.operation}, mission: ${data.mission}, phase: ${data.phase}`);
            delete Memory.timeoutTracker;
        }

        Memory.timeoutTracker = { phase: "pre-operation init", operation: undefined, mission: undefined };
    }

    public static log(phase: string, operation?: string, mission?: string) {
        Memory.timeoutTracker.operation = operation;
        Memory.timeoutTracker.mission = mission;
        Memory.timeoutTracker.phase = phase;
    }

    public static finalize() {
        delete Memory.timeoutTracker;
    }
}