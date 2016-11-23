export var profiler = {
    start(identifier: string) {
        this.cpu = Game.cpu.getUsed();
        if (!Memory.profiler[identifier]) Memory.profiler[identifier] = {
            tickBegin: Game.time,
            lastTickTracked: undefined,
            total: 0,
            count: 0,
            costPerCall: undefined,
            costPerTick: undefined,
            callsPerTick: undefined,
        };
        Memory.profiler[identifier].lastTickTracked = Game.time;
    },

    end(identifier: string, period = 10) {
        let profile = Memory.profiler[identifier];
        profile.total += Game.cpu.getUsed() - this.cpu;
        profile.count++;

        if (Game.time - profile.tickBegin >= period - 1) {
            profile.costPerCall = _.round(profile.total / profile.count, 2);
            profile.costPerTick = _.round(profile.total / period, 2);
            profile.callsPerTick = _.round(profile.count / period, 2);
            // console.log("PROFILER:", identifier, "perTick:", profile.costPerTick, "perCall:",
            //    profile.costPerCall, "calls per tick:", profile.callsPerTick);
            profile.tickBegin = Game.time + 1;
            profile.total = 0;
            profile.count = 0;
        }
    }
};