import {notifier} from "./notifier";
export class Profiler {

    public static start(identifier: string, consoleReport = false, period = 5) {
        let profile = this.initProfile(identifier, consoleReport, period);
        profile.cpu = Game.cpu.getUsed();
    }

    public static end(identifier: string) {
        let profile = Memory.profiler[identifier];
        let cpu = Game.cpu.getUsed() - profile.cpu;
        profile.total += cpu;
        profile.count++;
        if (profile.highest < cpu) {
            profile.highest = cpu;
        }

        if (cpu > 300) {
            notifier.log(`${identifier}, ${cpu}`);
            return;
        }

        if (identifier === "actions") { return; }

        if (cpu > 150) {
            notifier.log(`${identifier}, ${cpu}`);
            return;
        }

        if (identifier === "init") { return; }

        if (cpu > 100) {
            notifier.log(`${identifier}, ${cpu}`);
            return;
        }

        if (identifier === "roleCall") { return; }
        if (identifier === "finalize") { return; }

        if (cpu > 40) {
            notifier.log(`${identifier}, ${cpu}`);
        }
    }

    public static resultOnly(identifier: string, result: number, consoleReport = false, period = 5) {
        let profile = this.initProfile(identifier, consoleReport, period);
        profile.total += result;
        profile.count++;
    }

    public static initProfile(identifier: string, consoleReport: boolean, period: number): ProfilerData {
        if (!Memory.profiler[identifier]) {
            Memory.profiler[identifier] = {} as ProfilerData;
        }
        _.defaults(Memory.profiler[identifier], {total: 0, count: 0, endOfPeriod: Game.time + period, highest: 0});
        Memory.profiler[identifier].period = period;
        Memory.profiler[identifier].consoleReport = consoleReport;
        Memory.profiler[identifier].lastTickTracked = Game.time;
        return Memory.profiler[identifier];
    }

    public static finalize() {
        for (let identifier in Memory.profiler) {
            let profile = Memory.profiler[identifier];
            if (Game.time >= profile.endOfPeriod) {
                if (profile.count !== 0) {
                    profile.costPerCall = _.round(profile.total / profile.count, 2);
                }
                profile.costPerTick = _.round(profile.total / profile.period, 2);
                profile.callsPerTick = _.round(profile.count / profile.period, 2);
                profile.max = profile.highest;

                if (profile.consoleReport) {
                    console.log("PROFILER:", identifier, "perTick:", profile.costPerTick, "perCall:",
                        profile.costPerCall, "calls per tick:", profile.callsPerTick);
                }

                profile.endOfPeriod = Game.time + profile.period;
                profile.total = 0;
                profile.count = 0;
                profile.highest = 0;
            }
            if (Game.time - profile.lastTickTracked > 100) {
                delete Memory.profiler[identifier];
            }
        }

        if (Game.time % 10 === 0) {
            // Memory serialization will cause additional CPU use, better to err on the conservative side
            Memory.cpu.history.push(Game.cpu.getUsed() + Game.gcl.level / 5);
            Memory.cpu.average = _.sum(Memory.cpu.history) / Memory.cpu.history.length;
            while (Memory.cpu.history.length > 100) {
                Memory.cpu.history.shift();
            }
        }
    }

    public static proportionUsed() {
        return Memory.cpu.average / (Game.gcl.level * 10 + 20);
    }
}
