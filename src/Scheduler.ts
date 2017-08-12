export class Scheduler {
    private static ranThisTick: {[taskName: string]: boolean };
    private static passiveProcesses: {[priority: number]: (() => void)[]; };
    private static passiveCpu: number;

    public static update() {
        this.ranThisTick = {};
        this.passiveProcesses = {};
        this.passiveCpu = 0;
    }

    public static finalize() {
        let cpu = Game.cpu.getUsed();
        let completed;
        if (!Memory.playerConfig.cpuLimit) {
            completed = this.executePassives();
        }
        Memory.stats["game.prof.passive"] = Game.cpu.getUsed() - cpu;
        Memory.stats["game.prof.passiveComplete"] = completed ? 1 : 0;
    }

    /**
     * Returns false every x ticks (on average) when CPU is below 250.
     * @param memory
     * @param taskName
     * @param interval
     * @returns {boolean}
     */

    public static delay(memory: any, taskName: string, interval: number): boolean {
        if (Game.cpu.getUsed() > 300) { return true; }
        if (Game.time < memory[taskName]) { return true; }

        // run only a single task type per tick
        if (this.ranThisTick[taskName]) { return true; }
        this.ranThisTick[taskName] = true;

        memory[taskName] = Game.time + Scheduler.randomInterval(interval);
        return false;
    }

    public static underLimit(): boolean {
        return Game.cpu.bucket > 9000 && Game.cpu.getUsed() < 320;
    }

    public static nextTick(memoryHost: {memory: any}, taskName: string) {
        memoryHost.memory[taskName] = Game.time + 1;
    }

    public static randomInterval(interval: number): number {
        return interval + Math.floor((Math.random() - .5) * interval * .2);
    }

    public static addPassiveProcess(priority: SchedulerPriority, func: () => void) {
        if (!this.passiveProcesses[priority]) {this.passiveProcesses[priority] = []; }
        this.passiveProcesses[priority].push(func);
    }

    private static executePassives() {
        for (let priority of [SchedulerPriority.High, SchedulerPriority.Medium, SchedulerPriority.Low]) {
            let processes = this.passiveProcesses[priority];
            if (!processes) { continue; }

            for (let process of processes) {
                if (!this.underLimit()) {
                    return false;
                }
                try {
                    process();
                } catch (e) {
                    console.log(`SCHEDULER: error with passive process`);
                    console.log(e.stack);
                }
            }
            return true;
        }
    }
}

export enum SchedulerPriority { High, Medium, Low }
