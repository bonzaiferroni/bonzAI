export const profiler = {

    start(identifier: string, consoleReport = false, period = 5) {
        if (!Memory.profiler[identifier]) {
            Memory.profiler[identifier] = {} as ProfilerData;
        }
        _.defaults(Memory.profiler[identifier], {total: 0, count: 0, startOfPeriod: Game.time - 1});
        Memory.profiler[identifier].period = period;
        Memory.profiler[identifier].consoleReport = consoleReport;
        Memory.profiler[identifier].lastTickTracked = Game.time;
        Memory.profiler[identifier].cpu = Game.cpu.getUsed();
    },

    end(identifier: string) {
        let profile = Memory.profiler[identifier];
        profile.total += Game.cpu.getUsed() - profile.cpu;
        profile.count++;
    },

    finalize() {
        for (let identifier in Memory.profiler) {
            let profile = Memory.profiler[identifier];
            if (Game.time - profile.startOfPeriod >= profile.period) {
                if (profile.count !== 0) {
                    profile.costPerCall = _.round(profile.total / profile.count, 2);
                }
                profile.costPerTick = _.round(profile.total / profile.period, 2);
                profile.callsPerTick = _.round(profile.count / profile.period, 2);
                if (profile.consoleReport) {
                    console.log("PROFILER:", identifier, "perTick:", profile.costPerTick, "perCall:",
                        profile.costPerCall, "calls per tick:", profile.callsPerTick);
                }
                profile.startOfPeriod = Game.time;
                profile.total = 0;
                profile.count = 0;
            }
            if (Game.time - profile.lastTickTracked > 10000) {
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
    },

    proportionUsed() {
        return Memory.cpu.average / (Game.gcl.level * 10 + 20);
    }
};