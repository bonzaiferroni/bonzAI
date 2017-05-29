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

        // if (cpu > 50 && cpu > profile.costPerCall * 100) {
        //     notifier.log(`PROFILER: high cpu alert: ${identifier}, cpu: ${cpu
        //     }, typical: ${profile.costPerCall}`);
        // }
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
        this.updateProfiles();
        this.gargabeCollect();
    }

    private static updateProfiles() {
        for (let identifier in Memory.profiler) {
            let profile = Memory.profiler[identifier];
            if (Game.time - profile.lastTickTracked > 1000) {
                delete Memory.profiler[identifier];
                continue;
            }

            if (Game.time >= profile.endOfPeriod) {
                if (profile.count === 0) { continue; }
                profile.costPerCall = _.round(profile.total / profile.count, 1);
                profile.costPerTick = _.round(profile.total / profile.period, 1);
                profile.callsPerTick = _.round(profile.count / profile.period, 1);
                profile.max = _.round(profile.highest, 1);

                if (profile.consoleReport) {
                    console.log("PROFILER:", identifier, "perTick:", profile.costPerTick, "perCall:",
                        profile.costPerCall, "calls per tick:", profile.callsPerTick, "max:", profile.max);
                }

                profile.endOfPeriod = Game.time + profile.period;
                profile.total = 0;
                profile.count = 0;
                profile.highest = 0;
            }
        }
    }

    private static gargabeCollect() {
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

    public static memoryProfile(memory?: any) {
        if (!memory) {
            memory = Memory;
        }

        for (let propertyName in memory) {
            let value = memory[propertyName];
            let cpu = Game.cpu.getUsed();
            let str = JSON.stringify(value);
            JSON.parse(str);
            console.log(`${propertyName}: ${Game.cpu.getUsed() - cpu}`);
        }
        // this.recursiveMemoryAnalysis(memory, "Memory");
    }

    private static recursiveMemoryAnalysis(node: any, path: string) {
        let subNodes = [];
        for (let key in node) {
            let subNode = node[key];
            if (typeof(subNode) !== "object") { continue; }
            let length = JSON.stringify(subNode).length;
            if (length < 1000) { continue; }
            let subPath = `${path}.${key}`;
            console.log(`path: ${subPath}, length: ${length}`);
            subNodes.push({path: subPath, node: subNode});
        }

        for (let item of subNodes) {
            this.recursiveMemoryAnalysis(item.node, item.path);
        }
    }
}

// make available through console
global.profiler = Profiler;
